// gastubos/frontend/src/pages/DiagnosticoBluetoothPage.jsx
//
// Herramienta de diagnóstico standalone (sin auth) para probar, con la
// impresora térmica FTX TDR058BT real en mano, si expone un perfil BLE/GATT
// utilizable desde la Web Bluetooth API. No se linkea desde ningún menú.
//
// Uso: abrir /diagnostico-bluetooth en Chrome/Edge de Android, tocar
// "Buscar impresora", elegirla en el picker nativo, revisar los servicios y
// características encontradas, y probar "Enviar ticket de prueba" sobre la
// que tenga la propiedad "write" o "writeWithoutResponse".
//
// Si la impresora nunca aparece en el picker, o aparece pero ninguna
// característica acepta escritura: el perfil es Bluetooth clásico (SPP) y
// no hay forma de imprimir en ella desde un navegador.

import { useState } from 'react'
import { EscPosBuilder } from '../utils/escPosBuilder.js'
import { SERVICIOS_CANDIDATOS } from '../utils/webBluetoothPrinter.js'

const CHUNK_SIZE = 20 // Web Bluetooth no expone el MTU negociado; arrancamos conservador
const CHUNK_DELAY = 40 // ms

// characteristic.properties es una interfaz BluetoothCharacteristicProperties:
// sus flags son getters heredados del prototipo, no propiedades propias, así
// que Object.entries(props) no los ve — hay que listarlos a mano.
const PROP_KEYS = [
  'broadcast', 'read', 'writeWithoutResponse', 'write',
  'notify', 'indicate', 'authenticatedSignedWrites', 'reliableWrite', 'writableAuxiliaries',
]

function propsToString(props) {
  return PROP_KEYS.filter((k) => props[k]).join(', ') || '(ninguna)'
}

export default function DiagnosticoBluetoothPage() {
  const [log, setLog] = useState([])
  const [device, setDevice] = useState(null)
  const [caracteristicas, setCaracteristicas] = useState([]) // [{ uuid, serviceUuid, characteristic, properties }]
  const [buscando, setBuscando] = useState(false)
  const [enviando, setEnviando] = useState(null) // uuid de la característica en curso

  const soportado = typeof navigator !== 'undefined' && !!navigator.bluetooth

  const addLog = (msg, tipo = 'info') => {
    setLog((prev) => [...prev, { msg, tipo, ts: new Date().toLocaleTimeString('es-PY') }])
  }

  const buscarImpresora = async () => {
    setLog([])
    setCaracteristicas([])
    setBuscando(true)
    try {
      addLog('Abriendo selector de dispositivos Bluetooth...')
      const dev = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: SERVICIOS_CANDIDATOS,
      })
      setDevice(dev)
      addLog(`Dispositivo elegido: "${dev.name || '(sin nombre)'}" (${dev.id})`, 'ok')

      addLog('Conectando al servidor GATT...')
      const server = await dev.gatt.connect()
      addLog('Conectado. Buscando servicios accesibles...', 'ok')

      const servicios = await server.getPrimaryServices()
      if (servicios.length === 0) {
        addLog('El dispositivo no expuso ningún servicio de la lista de candidatos. Puede que use otro UUID (revisar con nRF Connect) o que sea Bluetooth clásico (SPP), no BLE.', 'error')
      }

      const encontradas = []
      for (const service of servicios) {
        addLog(`Servicio: ${service.uuid}`)
        const chars = await service.getCharacteristics()
        for (const characteristic of chars) {
          const props = characteristic.properties
          addLog(`  Característica: ${characteristic.uuid} — propiedades: ${propsToString(props)}`)
          if (props.write || props.writeWithoutResponse) {
            encontradas.push({
              uuid: characteristic.uuid,
              serviceUuid: service.uuid,
              characteristic,
              properties: props,
            })
          }
        }
      }
      setCaracteristicas(encontradas)

      if (encontradas.length === 0) {
        addLog('No se encontró ninguna característica escribible. Sin una vía de escritura no se puede imprimir desde acá.', 'error')
      } else {
        addLog(`${encontradas.length} característica(s) escribible(s) encontrada(s). Probá "Enviar ticket de prueba" en cada una.`, 'ok')
      }
    } catch (err) {
      addLog('Error: ' + (err?.message || String(err)), 'error')
    } finally {
      setBuscando(false)
    }
  }

  const enviarTicketPrueba = async (entrada) => {
    setEnviando(entrada.uuid)
    try {
      const builder = new EscPosBuilder()
      builder
        .initialize()
        .alignCenter()
        .boldOn()
        .addTextLine('PRUEBA WEB BLUETOOTH')
        .boldOff()
        .addTextLine(new Date().toLocaleString('es-PY'))
        .addTextLine('--------------------------------')
        .alignLeft()
        .addTextLine(`Servicio: ${entrada.serviceUuid}`)
        .addTextLine(`Caracteristica: ${entrada.uuid}`)
        .feedLines(3)
      const buffer = builder.getBuffer()

      const { characteristic, properties } = entrada
      const usarSinRespuesta = !!properties.writeWithoutResponse

      addLog(`Enviando ${buffer.length} bytes en trozos de ${CHUNK_SIZE}...`)
      for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
        const trozo = buffer.slice(i, i + CHUNK_SIZE)
        if (usarSinRespuesta) {
          await characteristic.writeValueWithoutResponse(trozo)
        } else {
          await characteristic.writeValue(trozo)
        }
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY))
      }
      addLog('Ticket de prueba enviado. Revisá si salió impreso.', 'ok')
    } catch (err) {
      addLog('Error al enviar: ' + (err?.message || String(err)), 'error')
    } finally {
      setEnviando(null)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Diagnóstico Bluetooth (FTX TDR058BT)</h1>
      <p style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>
        Herramienta interna para verificar si la impresora es visible por Web Bluetooth (BLE). No requiere login.
      </p>

      {!soportado ? (
        <div style={{ background: '#fdecea', border: '1px solid #f5c2c7', borderRadius: 8, padding: 16, color: '#842029' }}>
          Este navegador no soporta Web Bluetooth (<code>navigator.bluetooth</code> no existe). Esto pasa siempre en
          iOS (Safari, y también Chrome/Firefox de iOS) y en Firefox de Android — es una limitación del navegador,
          no de este dispositivo en particular. Probá con Chrome o Edge en Android.
        </div>
      ) : (
        <>
          <button
            onClick={buscarImpresora}
            disabled={buscando}
            style={{
              padding: '10px 18px', fontSize: 14, borderRadius: 8, border: 'none',
              background: buscando ? '#9db8d8' : '#185FA5', color: '#fff', cursor: buscando ? 'default' : 'pointer',
            }}
          >
            {buscando ? 'Buscando...' : 'Buscar impresora'}
          </button>

          {device && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#333' }}>
              Dispositivo: <strong>{device.name || '(sin nombre)'}</strong>
            </div>
          )}

          {caracteristicas.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Características escribibles</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {caracteristicas.map((c) => (
                  <div key={c.uuid} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#555' }}>{c.uuid}</div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{propsToString(c.properties)}</div>
                    <button
                      onClick={() => enviarTicketPrueba(c)}
                      disabled={enviando === c.uuid}
                      style={{
                        padding: '6px 12px', fontSize: 13, borderRadius: 6, border: '1px solid #185FA5',
                        background: '#fff', color: '#185FA5', cursor: enviando === c.uuid ? 'default' : 'pointer',
                      }}
                    >
                      {enviando === c.uuid ? 'Enviando...' : 'Enviar ticket de prueba'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Registro</div>
            <div style={{
              background: '#111', color: '#0f0', fontFamily: 'monospace', fontSize: 11,
              borderRadius: 8, padding: 12, maxHeight: 320, overflowY: 'auto',
            }}>
              {log.length === 0 && <div style={{ color: '#666' }}>(vacío)</div>}
              {log.map((l, i) => (
                <div key={i} style={{ color: l.tipo === 'error' ? '#ff6b6b' : l.tipo === 'ok' ? '#5eff8f' : '#0f0' }}>
                  [{l.ts}] {l.msg}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
