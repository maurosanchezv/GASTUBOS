// gastubos/frontend/src/utils/webBluetoothPrinter.js
// Impresión térmica ESC/POS vía Web Bluetooth (BLE), para usar directo desde
// el navegador del teléfono sin pasar por la app nativa. Complementa a
// window.bluetoothSerial (Bluetooth clásico, usado dentro de la app
// Capacitor) sin reemplazarlo — ver RepartoPage.jsx para el despacho entre
// ambos según lo que soporte el entorno.
//
// Solo funciona en Android con Chrome/Edge/Samsung Internet: Web Bluetooth
// no existe en ningún navegador de iOS (restricción de Apple) ni en Firefox.

// Por privacidad, Web Bluetooth bloquea el acceso a cualquier servicio GATT
// no declarado de antemano como optionalServices, aunque el picker use
// acceptAllDevices. Esta lista se confirmó funcionando contra la impresora
// FTX TDR058BT real (ver DiagnosticoBluetoothPage.jsx).
export const SERVICIOS_CANDIDATOS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // usado por varias impresoras ESC/POS BLE (Goojprt/Gainscha y clones)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip RN4677 / muchos clones de impresora
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (NUS)
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / módulos serial BLE genéricos
  '0000ff00-0000-1000-8000-00805f9b34fb', // otro rango genérico usado por impresoras chinas
]

const CHUNK_SIZE = 20 // Web Bluetooth no expone el MTU negociado; arrancamos conservador
const CHUNK_DELAY = 40 // ms

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// navigator.bluetooth también existe en Chrome/Edge de escritorio, no solo en
// Android — por eso no alcanza con chequear solo eso. Esta función es la que
// hay que usar antes de ofrecer la vía Bluetooth por navegador: si no la
// pasás, en una computadora sin adaptador Bluetooth requestDevice() rechaza
// con NotFoundError ("Bluetooth adapter not available") y no pasa nada
// visible, rompiendo la impresión de escritorio que ya funcionaba con
// window.print(). Reservá esta vía solo para navegador de teléfono.
export function esNavegadorMovilConWebBluetooth() {
  return window.innerWidth < 768 && !!navigator.bluetooth
}

// Abre el selector nativo del navegador (debe llamarse directo desde un
// gesto de usuario), conecta por GATT y devuelve la primera característica
// escribible que encuentre entre los servicios candidatos.
export async function conectarImpresoraWebBluetooth() {
  if (!navigator.bluetooth) {
    throw new Error('Este navegador no soporta Web Bluetooth')
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: SERVICIOS_CANDIDATOS,
  })
  const server = await device.gatt.connect()
  const servicios = await server.getPrimaryServices()

  for (const service of servicios) {
    const caracteristicas = await service.getCharacteristics()
    for (const characteristic of caracteristicas) {
      const props = characteristic.properties
      if (props.write || props.writeWithoutResponse) {
        return { device, characteristic, writeWithoutResponse: !!props.writeWithoutResponse }
      }
    }
  }

  device.gatt.disconnect()
  throw new Error('La impresora no expone ninguna característica Bluetooth escribible')
}

// Envía el buffer en trozos chicos (límite de escritura GATT) y desconecta al terminar.
export async function enviarBufferWebBluetooth(conexion, buffer) {
  const { device, characteristic, writeWithoutResponse } = conexion
  try {
    for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
      const trozo = buffer.slice(i, i + CHUNK_SIZE)
      if (writeWithoutResponse) {
        await characteristic.writeValueWithoutResponse(trozo)
      } else {
        await characteristic.writeValue(trozo)
      }
      await delay(CHUNK_DELAY)
    }
  } finally {
    device.gatt.disconnect()
  }
}
