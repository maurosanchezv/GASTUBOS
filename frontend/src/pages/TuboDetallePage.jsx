// gastubos/frontend/src/pages/TuboDetallePage.jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useReactToPrint } from "react-to-print";
import api from "../services/api.js";
import {
  PageHeader,
  StateBadge,
  Modal,
  FormGroup,
  Spinner,
  formatCapacidad,
} from "../components/ui.jsx";
import { useConfigStore } from "../store/configStore.js";
import { useToast } from "../components/ui.jsx";
import { TRANSICIONES } from "../utils/estadosTubo.js";
import { getBrandingSources } from "../utils/logosSvg.js";

const GAS_LABELS = {
  CO2: "CO₂",
  OXIGENO: "Oxígeno",
  ARGON: "Argón",
  NITROGENO: "Nitrógeno",
  AIRE_COMPRIMIDO: "Aire comprimido",
  MEZCLA_CO2_ARGON: "Mezcla CO₂/Argón",
  ACETILENO: "Acetileno",
};

export default function TuboDetallePage() {
  const { nombre_empresa, telefono, isotipo_empresa, logo_empresa, fetchConfig } = useConfigStore();
  const branding = getBrandingSources(isotipo_empresa, logo_empresa);
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const printRef = useRef();

  const [tubo, setTubo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cambioModal, setCambioModal] = useState(false);
  const [qrModal, setQrModal] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [obsEstado, setObsEstado] = useState("");
  const [clientes, setClientes] = useState([]);
  const [clienteIdReserva, setClienteIdReserva] = useState("");

  // Impresión Bluetooth
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [pairedDevices, setPairedDevices] = useState([]);
  const [connectingPrinter, setConnectingPrinter] = useState(false);
  const [selectedDeviceAddress, setSelectedDeviceAddress] = useState("");

  async function load() {
    setLoading(true);
    try {
      fetchConfig();
      const res = await api.get(`/tubos/${id}`);
      setTubo(res.data);
    } catch {
      toast("Tubo no encontrado", "error");
      navigate("/tubos");
    } finally {
      setLoading(false);
    }
  }

  const buscarImpresoras = () => {
    if (!window.bluetoothSerial) {
      toast("Bluetooth no disponible en este dispositivo", "error");
      return;
    }
    setConnectingPrinter(true);
    setPrinterModalOpen(true);
    window.bluetoothSerial.list(
      (devices) => {
        setPairedDevices(devices);
        setConnectingPrinter(false);
        const autoDevice = devices.find(
          (d) => d.name && d.name.toUpperCase().includes("HM-A300"),
        );
        if (autoDevice) {
          setSelectedDeviceAddress(autoDevice.address || autoDevice.id);
        }
      },
      (err) => {
        toast("Error al buscar dispositivos: " + err, "error");
        setConnectingPrinter(false);
      },
    );
  };

  const imprimirTuboBluetooth = (t, deviceAddress) => {
    if (!window.bluetoothSerial) return;
    if (!deviceAddress) {
      toast("Por favor, selecciona una impresora", "warning");
      return;
    }
    setConnectingPrinter(true);

    window.bluetoothSerial.connect(
      deviceAddress,
      () => {
        try {
          const clean = (str) => {
            if (!str) return "";
            return str
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/ñ/g, "n")
              .replace(/Ñ/g, "N");
          };

          const gasDesc = clean(t.gas);
          const capDesc = clean(
            `Capacidad: ${formatCapacidad(t).replace("³", "3")}`,
          );
          const ownerDesc = clean(
            t.propietario === "CLIENTE"
              ? `PROPIETARIO: CLIENTE - ${t.propietarioCliente?.nombre || t.cliente?.nombre || "Desconocido"}`
              : `PROPIETARIO: ${(nombre_empresa || "PROPIO").toUpperCase()}`,
          );
          const nroSerie = t.serie ? clean(`Nro Serie: ${t.serie}`) : "";

          // El ancho de etiqueta para 80mm es de 640 dots a 203 dpi
          // Altura total de etiqueta: 640 dots (aprox 80mm) para que sea cuadrada
          let cpcl = "";
          cpcl += "! 0 200 200 640 1\r\n"; // Header (offset, horizontal dpi, vertical dpi, height, qty)
          cpcl += "PAGE-WIDTH 640\r\n";

          // Título (inicia en y=50 para dejar margen arriba)
          cpcl += "ALIGN CENTER\r\n";
          cpcl += "SETBOLD 1\r\n";
          cpcl += "TEXT 4 0 0 50 ETIQUETA DE CILINDRO\r\n";
          cpcl += "SETBOLD 0\r\n";

          // ID del tubo (Grande, y=95)
          cpcl += "SETMAG 2 2\r\n";
          cpcl += `TEXT 4 0 0 95 ${clean(t.id)}\r\n`;
          cpcl += "SETMAG 1 1\r\n";

          // Detalles (alineados a la izquierda con un margen de 20 dots)
          cpcl += "ALIGN LEFT\r\n";
          cpcl += `TEXT 4 0 20 170 ${gasDesc}\r\n`;
          cpcl += `TEXT 4 0 20 200 ${capDesc}\r\n`;

          let nextY = 230;
          if (nroSerie) {
            cpcl += `TEXT 4 0 20 ${nextY} ${nroSerie}\r\n`;
            nextY += 30;
          }
          cpcl += `TEXT 4 0 20 ${nextY} ${ownerDesc}\r\n`;
          nextY += 40; // Espaciado cómodo antes del QR

          // Código QR grande (U 8, tamaño módulo = 8, ancho aprox 264 dots)
          // x=188 centra el código en el ancho de 640 dots ((640 - 264) / 2 = 188)
          cpcl += "ALIGN CENTER\r\n";
          cpcl += `B QR 188 ${nextY} M 2 U 8\r\n`;
          cpcl += `${tuboUrl}\r\n`;
          cpcl += "ENDQR\r\n";
          nextY += 270; // Espaciado para el tamaño del QR (33 * 8 = 264 dots)

          // Texto de URL abajo
          cpcl += "ALIGN CENTER\r\n";
          cpcl += `TEXT 4 0 0 ${nextY} ${clean(tuboUrl).slice(0, 48)}\r\n`;
          if (clean(tuboUrl).length > 48) {
            cpcl += `TEXT 4 0 0 ${nextY + 20} ${clean(tuboUrl).slice(48)}\r\n`;
          }

          cpcl += "PRINT\r\n";

          // Convertir string de CPCL a Uint8Array
          const encoder = new TextEncoder();
          const binaryBuffer = encoder.encode(cpcl);

          window.bluetoothSerial.write(
            binaryBuffer,
            () => {
              toast("Etiqueta enviada correctamente", "success");
              setConnectingPrinter(false);
              setPrinterModalOpen(false);
              window.bluetoothSerial.disconnect();
            },
            (err) => {
              toast("Error al enviar a impresora: " + err, "error");
              setConnectingPrinter(false);
              window.bluetoothSerial.disconnect();
            },
          );
        } catch (e) {
          toast("Error de formato: " + e.message, "error");
          setConnectingPrinter(false);
          window.bluetoothSerial.disconnect();
        }
      },
      (err) => {
        toast("No se pudo conectar a la impresora", "error");
        setConnectingPrinter(false);
      },
    );
  };

  useEffect(() => {
    api
      .get("/clientes")
      .then((res) => setClientes(res.data))
      .catch(() => {});
  }, []);

  const getPublicTuboUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL || "";
    if (apiUrl.startsWith("http")) {
      const base = apiUrl.replace("/api", "");
      return `${base}/tubos/${id}`;
    }
    return `${window.location.origin}/tubos/${id}`;
  };
  const tuboUrl = getPublicTuboUrl();

  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    pageStyle: `
      @page {
        size: 80mm 50mm;
        margin: 0 !important;
      }
      @media print {
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 80mm !important;
          height: 50mm !important;
          background: #fff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          overflow: hidden !important;
        }
        #tubo-print-label {
          width: 80mm !important;
          height: 44mm !important;
          position: absolute !important;
          top: 3mm !important;
          left: 0 !important;
          margin: 0 !important;
          padding: 1mm 3mm 0 3mm !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          border: none !important;
          box-shadow: none !important;
          border-radius: 0 !important;
        }
      }
    `,
  });

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (params.get("qr") === "1" && tubo) {
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        ) ||
        window.innerWidth < 768 ||
        window.Capacitor;
      if (isMobile) {
        setQrModal(true);
      } else {
        setTimeout(handlePrint, 800);
      }
    }
  }, [params, tubo]);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get(`/tubos/${id}`);
      setTubo(res.data);
    } catch {
      toast("Tubo no encontrado", "error");
      navigate("/tubos");
    } finally {
      setLoading(false);
    }
  }

  async function handleCambioEstado() {
    if (!nuevoEstado) return;
    setSaving(true);
    try {
      await api.post(`/tubos/${id}/cambiar-estado`, {
        estadoNuevo: nuevoEstado,
        observaciones: obsEstado,
        clienteId:
          nuevoEstado === "RESERVADO" ? clienteIdReserva || null : null,
      });
      toast("Estado actualizado", "success");
      setCambioModal(false);
      setNuevoEstado("");
      setObsEstado("");
      setClienteIdReserva("");
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Error al cambiar estado", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <>
        <PageHeader title="Detalle de Tubo" />
        <div className="app-content">
          <Spinner />
        </div>
      </>
    );
  if (!tubo) return null;

  const transiciones = TRANSICIONES[tubo.estado] || [];

  return (
    <>
      <PageHeader
        title={tubo.id}
        subtitle={`${tubo.gas} · ${formatCapacidad(tubo)}`}
        actions={
          <>
            <button className="btn btn-sm" onClick={() => navigate("/tubos")}>
              <i className="ti ti-arrow-left" /> Volver
            </button>
            {window.Capacitor || window.innerWidth < 768 ? (
              <button className="btn btn-sm" onClick={() => setQrModal(true)}>
                <i className="ti ti-qrcode" /> Ver QR
              </button>
            ) : (
              <button className="btn btn-sm" onClick={handlePrint}>
                <i className="ti ti-printer" /> Imprimir QR
              </button>
            )}
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setCambioModal(true)}
            >
              <i className="ti ti-refresh" /> Cambiar estado
            </button>
          </>
        }
      />

      <div className="app-content">
        <div className="responsive-grid">
          {/* Info principal */}
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title">Información del tubo</div>
                <StateBadge estado={tubo.estado} />
              </div>
              <div className="form-grid">
                {[
                  ["Código", tubo.id],
                  ["Número de cilindro", tubo.serie],
                  ["Tipo de gas", tubo.gas],
                  [
                    "Capacidad",
                    formatCapacidad(tubo),
                  ],
                  [
                    "Propietario",
                    tubo.propietario === "PROPIO"
                      ? (nombre_empresa || "PROPIO").toUpperCase()
                      : `CLIENTE - ${tubo.propietarioCliente?.nombre || tubo.cliente?.nombre || "Desconocido"}`,
                  ],
                  [
                    "Fecha de creación",
                    tubo.fechaCompra
                      ? new Date(tubo.fechaCompra).toLocaleDateString("es-PY")
                      : "—",
                  ],
                  ["Ubicación", tubo.ubicacion || "—"],
                  ["Cliente actual", tubo.cliente?.nombre || "—"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      padding: "0px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        marginBottom: 3,
                      }}
                    >
                      {k}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: k === "Código" ? 600 : 400,
                        fontFamily:
                          k === "Código" || k === "Número de cilindro"
                            ? "var(--font-mono)"
                            : "inherit",
                      }}
                    >
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Historial de cargas */}
            {tubo.cargas?.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <div className="card-title">Historial de cargas</div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {tubo.cargas.length} registro
                    {tubo.cargas.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {/* Vista Desktop: Tabla Completa */}
                <div className="desktop-only table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha/Hora</th>
                        <th>Tipo de carga</th>
                        <th>Gas</th>
                        <th>Cantidad</th>
                        <th>Precio Unit.</th>
                        <th>Monto Total</th>
                        <th>Operador</th>
                        <th>Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tubo.cargas.map((c) => {
                        const cant = Number(c.cantidad || 0);
                        const pu = Number(c.precioUnitario || 0);
                        const sub = cant * pu;
                        const uLabel = c.unidad === 'KG' ? 'kg' : 'm³';
                        return (
                          <tr key={c.id}>
                            <td
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 11,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {new Date(c.fechaCarga).toLocaleString("es-PY", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </td>
                            <td>
                              <span
                                className={`badge ${c.tipoCarga === 'SALON' ? 'badge-REPARTIDOR' : 'badge-CARGADO'}`}
                                style={{ fontSize: 10 }}
                              >
                                {c.tipoCarga === 'SALON' ? 'Salón' : 'Normal'}
                              </span>
                            </td>
                            <td>{GAS_LABELS[c.tipoGas] || c.tipoGas}</td>
                            <td style={{ fontWeight: 600 }}>
                              {cant.toLocaleString("es-PY")} {uLabel}
                            </td>
                            <td style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                              {pu > 0 ? `${pu.toLocaleString("es-PY")} GS/${uLabel}` : '—'}
                            </td>
                            <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>
                              {sub > 0 ? `${sub.toLocaleString("es-PY")} GS` : '—'}
                            </td>
                            <td
                              style={{
                                color: "var(--text-secondary)",
                                fontSize: 12,
                              }}
                            >
                              {c.operador?.nombre || c.operador?.username}
                            </td>
                            <td
                              style={{
                                color: "var(--text-secondary)",
                                fontSize: 11,
                                maxWidth: 120,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {c.observaciones || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Vista Móvil: Lista de Tarjetas */}
                <div
                  className="mobile-only"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: "8px 0",
                  }}
                >
                  {tubo.cargas.map((c) => {
                    const cant = Number(c.cantidad || 0);
                    const pu = Number(c.precioUnitario || 0);
                    const sub = cant * pu;
                    const uLabel = c.unidad === 'KG' ? 'kg' : 'm³';
                    return (
                      <div
                        key={c.id}
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justify: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>
                              {GAS_LABELS[c.tipoGas] || c.tipoGas}
                            </strong>
                            <span
                              className={`badge ${c.tipoCarga === 'SALON' ? 'badge-REPARTIDOR' : 'badge-CARGADO'}`}
                              style={{ fontSize: 9, padding: '1px 5px' }}
                            >
                              {c.tipoCarga === 'SALON' ? 'Salón' : 'Normal'}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "var(--blue)",
                            }}
                          >
                            {cant.toLocaleString("es-PY")} {uLabel}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 11,
                            color: "var(--text-secondary)",
                          }}
                        >
                          <span>
                            Precio: <strong>{pu > 0 ? `${pu.toLocaleString("es-PY")} GS/${uLabel}` : '—'}</strong>
                          </span>
                          <span>
                            Total: <strong style={{ color: 'var(--text-primary)' }}>{sub > 0 ? `${sub.toLocaleString("es-PY")} GS` : '—'}</strong>
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 11,
                            color: "var(--text-secondary)",
                          }}
                        >
                          <span>
                            Operador: {c.operador?.nombre || c.operador?.username}
                          </span>
                          <span style={{ fontFamily: "var(--font-mono)" }}>
                            {new Date(c.fechaCarga).toLocaleString("es-PY", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </div>

                        {c.observaciones && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Obs: {c.observaciones}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Historial */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Historial de movimientos</div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {tubo.auditoria?.length || 0} registros
                </span>
              </div>
              {tubo.auditoria?.length === 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-muted)",
                    textAlign: "center",
                    padding: "16px 0",
                  }}
                >
                  Sin movimientos registrados
                </p>
              ) : (
                <>
                  {/* Vista Desktop: Tabla Completa */}
                  <div className="desktop-only table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Acción</th>
                          <th>Usuario</th>
                          <th>Anterior</th>
                          <th>Nuevo</th>
                          <th>Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tubo.auditoria?.map((a) => (
                          <tr key={a.id}>
                            <td
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 10,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {new Date(a.createdAt).toLocaleString("es-PY", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </td>
                            <td>
                              <div style={{ fontWeight: 500 }}>{a.accion}</div>
                              {a.metadata?.cantidad && (
                                <div style={{ fontSize: 11, color: "var(--blue)", fontWeight: 600, marginTop: 2, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  ⛽ {Number(a.metadata.cantidad).toLocaleString("es-PY")} {a.metadata.unidad === 'KG' ? 'kg' : 'm³'}
                                </div>
                              )}
                              {a.metadata?.numero && !a.metadata?.cantidad && (
                                <div style={{ fontSize: 11, color: "var(--purple, #8b5cf6)", fontWeight: 600, marginTop: 2, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  📄 Remisión: {a.metadata.numero}
                                </div>
                              )}
                            </td>
                            <td style={{ color: "var(--text-secondary)" }}>
                              {a.usuario?.username}
                            </td>
                            <td>
                              {a.estadoAnterior ? (
                                <StateBadge estado={a.estadoAnterior} />
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {a.estadoNuevo ? (
                                <StateBadge estado={a.estadoNuevo} />
                              ) : (
                                "—"
                              )}
                            </td>
                            <td
                              style={{
                                color: "var(--text-secondary)",
                                fontSize: 11,
                                maxWidth: 120,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {a.observaciones || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Vista Móvil: Lista de Tarjetas */}
                  <div
                    className="mobile-only"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      padding: "8px 0",
                    }}
                  >
                    {tubo.auditoria?.map((a) => (
                      <div
                        key={a.id}
                        style={{
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 12,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <strong
                              style={{
                                fontSize: 13,
                                color: "var(--text-primary)",
                              }}
                            >
                              {a.accion}
                            </strong>
                            {a.metadata?.cantidad && (
                              <span style={{ fontSize: 11, color: "var(--blue)", fontWeight: 600 }}>
                                ⛽ Carga: {Number(a.metadata.cantidad).toLocaleString("es-PY")} {a.metadata.unidad === 'KG' ? 'kg' : 'm³'}
                              </span>
                            )}
                            {a.metadata?.numero && !a.metadata?.cantidad && (
                              <span style={{ fontSize: 11, color: "var(--purple, #8b5cf6)", fontWeight: 600 }}>
                                📄 Remisión: {a.metadata.numero}
                              </span>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--text-muted)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {new Date(a.createdAt).toLocaleString("es-PY", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                            fontSize: 11,
                          }}
                        >
                          <span style={{ color: "var(--text-secondary)" }}>
                            Estado:
                          </span>
                          {a.estadoAnterior ? (
                            <StateBadge estado={a.estadoAnterior} />
                          ) : (
                            "—"
                          )}
                          <i
                            className="ti ti-arrow-right"
                            style={{ color: "var(--text-muted)", fontSize: 12 }}
                          />
                          {a.estadoNuevo ? (
                            <StateBadge estado={a.estadoNuevo} />
                          ) : (
                            "—"
                          )}
                        </div>

                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                          }}
                        >
                          Usuario: <strong>{a.usuario?.username}</strong>
                        </div>

                        {a.observaciones && (
                          <div
                            style={{
                              fontSize: 10,
                              fontStyle: "italic",
                              color: "var(--text-muted)",
                              borderTop: "0.5px solid var(--border)",
                              paddingTop: 4,
                            }}
                          >
                            {a.observaciones}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sidebar QR */}
          <div>
            <div
              className="card"
              style={{ textAlign: "center", marginBottom: 16 }}
            >
              <div className="card-title" style={{ marginBottom: 14 }}>
                Código QR
              </div>

              {/* Contenedor de escala para evitar desborde en pantalla */}
              <div
                style={{
                  width: "100%",
                  height: "135px",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto",
                }}
              >
                <div
                  style={{
                    transform: "scale(0.78)",
                    transformOrigin: "center center",
                    flexShrink: 0,
                  }}
                >
                  {/* Printable label */}
                  <div
                    ref={printRef}
                    id="tubo-print-label"
                    style={{
                      width: "80mm",
                      height: "44mm",
                      padding: "1mm 3mm 0 3mm",
                      boxSizing: "border-box",
                      background: "#fff",
                      color: "#000",
                      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                      margin: "0 auto",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-start",
                      border: "1px solid var(--border-mid)",
                      borderRadius: "var(--radius-md)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                    }}
                  >
                {/* Top Row: Cylinder Code, Gas Type and Capacity */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1.5px solid #000",
                    paddingBottom: "2px",
                    marginBottom: "3px",
                    paddingLeft: "8px",
                    paddingRight: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: "800",
                      textTransform: "uppercase",
                      fontFamily: "var(--font-mono)",
                      color: "#000",
                    }}
                  >
                    {tubo.id}
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: "800",
                      textTransform: "uppercase",
                      letterSpacing: "0.3px",
                      color: "#000",
                    }}
                  >
                    {tubo.gas
                      ? (GAS_LABELS[tubo.gas] || tubo.gas).toUpperCase()
                      : "TIPO DE GAS"}
                    /
                    {formatCapacidad(tubo).toUpperCase()}
                  </div>
                </div>

                {/* Middle Section: 2 Columns */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "3px",
                    height: "32mm",
                  }}
                >
                  
                  {/* Left Column: Logo + Company Info */}
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      paddingRight: "6px",
                    }}
                  >
                    <img 
                      src={branding.isotipoSrc} 
                      alt="Isotipo" 
                      style={{ width: "40px", height: "40px", objectFit: "contain", display: "block", margin: "0 auto 2px" }} 
                    />
                    <img 
                      src={branding.logoSrc} 
                      alt="Logo" 
                      style={{ height: "22px", maxWidth: "90px", objectFit: "contain", display: "block", margin: "0 auto 2px" }} 
                    />
                    {/* Phone Number */}
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "800",
                        color: "#000",
                        marginTop: "2px",
                      }}
                    >
                      {telefono || "0985-920-400"}
                    </div>
                  </div>
{/* Right Column: QR Code */}
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <QRCodeSVG value={tuboUrl} size={105} level="M" />
                  </div>
                </div>

                {/* Bottom Row: Owner */}
                <div
                  style={{
                    borderTop: "1.5px solid #000",
                    paddingTop: "2px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: "800",
                      textTransform: "uppercase",
                      letterSpacing: "0.2px",
                      color: "#000",
                    }}
                  >
                    {tubo.propietario === "CLIENTE"
                      ? `CLIENTE - ${tubo.propietarioCliente?.nombre || tubo.cliente?.nombre || "DESCONOCIDO"}`
                      : `CILINDRO ${(nombre_empresa || "PROPIO").toUpperCase()}`}
                  </div>
                </div>
              </div>
            </div>
          </div>

              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  margin: "10px 0 14px",
                  wordBreak: "break-all",
                }}
              >
                {tuboUrl}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {window.Capacitor || window.innerWidth < 768 ? (
                  <>
                    <button
                      className="btn btn-secondary"
                      style={{
                        width: "100%",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                      onClick={() => setQrModal(true)}
                    >
                      <i className="ti ti-qrcode" /> Ampliar código QR
                    </button>
                    {(window.Capacitor || window.bluetoothSerial) && (
                      <button
                        className="btn btn-primary"
                        style={{
                          width: "100%",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                        onClick={buscarImpresoras}
                      >
                        <i className="ti ti-printer" /> Imprimir etiqueta
                        (Bluetooth)
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-primary"
                      style={{
                        width: "100%",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                      onClick={handlePrint}
                    >
                      <i className="ti ti-printer" /> Imprimir etiqueta (PC)
                    </button>
                    {window.bluetoothSerial && (
                      <button
                        className="btn btn-secondary"
                        style={{
                          width: "100%",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                        onClick={buscarImpresoras}
                      >
                        <i className="ti ti-printer" /> Imprimir (Bluetooth)
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Cambio rápido de estado */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 10 }}>
                Estado actual
              </div>
              <div style={{ marginBottom: 12 }}>
                <StateBadge estado={tubo.estado} />
              </div>
              {transiciones.length > 0 && (
                <>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginBottom: 8,
                    }}
                  >
                    Puede pasar a:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {transiciones.map((s) => (
                      <button
                        key={s}
                        className="badge"
                        style={{
                          cursor: "pointer",
                          border: "1px solid currentColor",
                        }}
                        onClick={() => {
                          setNuevoEstado(s);
                          setCambioModal(true);
                        }}
                      >
                        {s.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {transiciones.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Estado final, sin transiciones disponibles.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal cambio de estado */}
      <Modal
        open={cambioModal}
        title="Cambiar estado del tubo"
        onClose={() => {
          setCambioModal(false);
          setNuevoEstado("");
        }}
        footer={
          <>
            <button className="btn" onClick={() => setCambioModal(false)}>
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCambioEstado}
              disabled={!nuevoEstado || saving}
            >
              {saving ? "Guardando..." : "Confirmar cambio"}
            </button>
          </>
        }
      >
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              marginBottom: 8,
            }}
          >
            Estado actual: <StateBadge estado={tubo.estado} />
          </div>
        </div>
        <FormGroup label="Nuevo estado" required>
          <select
            value={nuevoEstado}
            onChange={(e) => setNuevoEstado(e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {transiciones.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </FormGroup>
        {nuevoEstado === "RESERVADO" && (
          <FormGroup label="Reservar para cliente" required>
            <select
              value={clienteIdReserva}
              onChange={(e) => setClienteIdReserva(e.target.value)}
            >
              <option value="">Seleccionar cliente...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </FormGroup>
        )}
        <FormGroup label="Observación">
          <textarea
            value={obsEstado}
            onChange={(e) => setObsEstado(e.target.value)}
            placeholder="Motivo del cambio (requerido para ciertos estados)..."
            style={{ height: 72 }}
          />
        </FormGroup>
      </Modal>

      {/* Modal visor de QR para móviles */}
      <Modal
        open={qrModal}
        title="Código QR del Cilindro"
        onClose={() => {
          setQrModal(false);
          navigate(`/tubos/${id}/detalle`, { replace: true });
        }}
        footer={
          <>
            <button
              className="btn"
              onClick={() => {
                setQrModal(false);
                navigate(`/tubos/${id}/detalle`, { replace: true });
              }}
            >
              Cerrar
            </button>
            {!window.Capacitor && (
              <button className="btn btn-primary" onClick={handlePrint}>
                <i className="ti ti-printer" /> Imprimir
              </button>
            )}
          </>
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 0",
          }}
        >
          {/* Formato Oficial de Etiqueta de Cilindro */}
          <div
            style={{
              width: "100%",
              maxWidth: "340px",
              background: "#ffffff",
              color: "#000000",
              padding: "12px 14px",
              boxSizing: "border-box",
              fontFamily: "Arial, sans-serif",
              margin: "0 auto 16px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              border: "2px solid #000",
              borderRadius: "10px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          >
            {/* Top Row: Cylinder Code, Gas Type and Capacity */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1.5px solid #000",
                paddingBottom: "4px",
                marginBottom: "8px",
              }}
            >
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: "800",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono)",
                  color: "#000",
                }}
              >
                {tubo.id}
              </div>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "800",
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                  color: "#000",
                }}
              >
                {tubo.gas
                  ? (GAS_LABELS[tubo.gas] || tubo.gas).toUpperCase()
                  : "TIPO DE GAS"}
                /
                {formatCapacidad(tubo).toUpperCase()}
              </div>
            </div>

            {/* Middle Section: 2 Columns */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              {/* Left Column: Logo + Company Info */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  paddingRight: "8px",
                }}
              >
                <img 
                  src={branding.isotipoSrc} 
                  alt="Isotipo" 
                  style={{ width: "40px", height: "40px", objectFit: "contain", display: "block", margin: "0 auto 2px" }} 
                />
                <img 
                  src={branding.logoSrc} 
                  alt="Logo" 
                  style={{ height: "22px", maxWidth: "90px", objectFit: "contain", display: "block", margin: "0 auto 2px" }} 
                />
                {/* Phone Number */}
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "800",
                    color: "#000",
                    marginTop: "2px",
                  }}
                >
                  {telefono || "0985-920-400"}
                </div>
              </div>

              {/* Right Column: QR Code */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <QRCodeSVG value={tuboUrl} size={130} level="M" />
              </div>
            </div>

            {/* Bottom Row: Owner */}
            <div
              style={{
                borderTop: "1.5px solid #000",
                paddingTop: "4px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "800",
                  textTransform: "uppercase",
                  letterSpacing: "0.2px",
                  color: "#000",
                }}
              >
                {tubo.propietario === "CLIENTE"
                  ? `CLIENTE - ${tubo.propietarioCliente?.nombre || tubo.cliente?.nombre || "DESCONOCIDO"}`
                  : `CILINDRO ${(nombre_empresa || "PROPIO").toUpperCase()}`}
              </div>
            </div>
          </div>

          <div
            style={{
              textAlign: "center",
              fontSize: 12,
              color: "var(--text-secondary)",
              maxWidth: 280,
              margin: "0 auto 8px",
            }}
          >
            Escanea este código QR con la cámara de otro dispositivo para
            acceder directamente a la ficha del cilindro.
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              wordBreak: "break-all",
              fontFamily: "var(--font-mono)",
            }}
          >
            {tuboUrl}
          </div>
        </div>
      </Modal>

      {/* Modal para selección de Impresora Bluetooth (HM-A300E) */}
      <Modal
        open={printerModalOpen}
        title="Impresoras Bluetooth Vinculadas"
        onClose={() => setPrinterModalOpen(false)}
        footer={
          <div style={{ display: "flex", gap: 10, width: "100%" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setPrinterModalOpen(false)}
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={() => imprimirTuboBluetooth(tubo, selectedDeviceAddress)}
              disabled={connectingPrinter || !selectedDeviceAddress}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {connectingPrinter ? (
                <Spinner size="sm" />
              ) : (
                <i className="ti ti-printer" />
              )}
              Imprimir Etiqueta
            </button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p
            style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}
          >
            Asegúrate de que la impresora <strong>HM-A300E</strong> esté
            encendida y vinculada en los Ajustes de Bluetooth de tu celular.
          </p>

          {connectingPrinter && pairedDevices.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center" }}>
              <Spinner />
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 8,
                }}
              >
                Buscando dispositivos vinculados...
              </div>
            </div>
          ) : pairedDevices.length === 0 ? (
            <div
              style={{
                padding: "20px 0",
                textAlign: "center",
                border: "1px dashed var(--border)",
                borderRadius: 8,
              }}
            >
              <i
                className="ti ti-bluetooth-off"
                style={{ fontSize: 24, color: "var(--text-muted)" }}
              />
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  marginTop: 8,
                }}
              >
                No se encontraron impresoras vinculadas.
              </div>
              <button
                className="btn btn-sm btn-secondary"
                onClick={buscarImpresoras}
                style={{ marginTop: 10 }}
              >
                Buscar de nuevo
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {pairedDevices.map((device) => {
                const esHMA300 =
                  device.name && device.name.toUpperCase().includes("HM-A300");
                const esSeleccionado =
                  selectedDeviceAddress === (device.address || device.id);
                return (
                  <div
                    key={device.address || device.id}
                    onClick={() =>
                      setSelectedDeviceAddress(device.address || device.id)
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      borderRadius: 8,
                      border: `1px solid ${esSeleccionado ? "var(--blue)" : "var(--border)"}`,
                      background: esSeleccionado
                        ? "var(--blue-light)"
                        : "var(--surface-2)",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: esSeleccionado ? 600 : 500,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <i
                          className="ti ti-bluetooth"
                          style={{
                            color: esHMA300
                              ? "var(--blue)"
                              : "var(--text-muted)",
                          }}
                        />
                        {device.name || "Dispositivo sin nombre"}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-mono)",
                          marginTop: 2,
                        }}
                      >
                        {device.address || device.id}
                      </div>
                    </div>
                    <i
                      className={`ti ${esSeleccionado ? "ti-circle-dot" : "ti-circle"}`}
                      style={{
                        color: esSeleccionado
                          ? "var(--blue)"
                          : "var(--text-muted)",
                        fontSize: 18,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
