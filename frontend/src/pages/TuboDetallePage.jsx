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
  const { nombre_empresa } = useConfigStore();
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
                        <th>Fecha</th>
                        <th>Gas</th>
                        <th>Cantidad</th>
                        <th>Operador</th>
                        <th>Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tubo.cargas.map((c) => (
                        <tr key={c.id}>
                          <td
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {new Date(c.fechaCarga).toLocaleDateString("es-PY")}
                          </td>
                          <td>{GAS_LABELS[c.tipoGas] || c.tipoGas}</td>
                          <td style={{ fontWeight: 600 }}>
                            {Number(c.cantidad).toLocaleString("es-PY")}{" "}
                            {c.unidad === "KG" ? "kg" : "m³"}
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
                  {tubo.cargas.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: 12,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <strong
                          style={{ fontSize: 13, color: "var(--text-primary)" }}
                        >
                          {GAS_LABELS[c.tipoGas] || c.tipoGas}
                        </strong>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "var(--blue)",
                          }}
                        >
                          {Number(c.cantidad).toLocaleString("es-PY")}{" "}
                          {c.unidad === "KG" ? "kg" : "m³"}
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
                          {new Date(c.fechaCarga).toLocaleDateString("es-PY")}
                        </span>
                      </div>

                      {c.observaciones && (
                        <div
                          style={{
                            fontSize: 10,
                            fontStyle: "italic",
                            color: "var(--text-muted)",
                            borderTop: "0.5px solid var(--border)",
                            paddingTop: 4,
                            marginTop: 2,
                          }}
                        >
                          {c.observaciones}
                        </div>
                      )}
                    </div>
                  ))}
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
                            <td>{a.accion}</td>
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
                          <strong
                            style={{
                              fontSize: 13,
                              color: "var(--text-primary)",
                            }}
                          >
                            {a.accion}
                          </strong>
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
                    {/* Logo Tubos SVG */}
                    <svg
                      viewBox="0 0 1080 1080"
                      style={{
                        width: "56px",
                        height: "56px",
                        display: "block",
                        margin: "0 auto 3px",
                      }}
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fill="#000"
                        strokeWidth="0"
                        d="m67.76,465.88c-.1-38.14.34-76.29,4.93-114.19,4.91-40.62,22.41-75.51,50.26-105.36,6.33-6.79,14.65-10.51,22.43-14.94,56.46-32.15,110.36-68.41,165.58-102.53,49.8-30.77,99.85-61.04,153.15-85.57,53.64-24.68,106.69-22.21,159.27,2.87,49.49,23.61,96.18,52.17,142.73,81,56.66,35.09,112.63,71.3,171.31,103.08,24.42,13.23,39.43,35.76,51.8,59.89,11.97,23.34,18.27,48.44,20.76,74.41.71,7.42-1.18,15.06-1.21,22.6-.14,34.07-1.27,68.2.22,102.21,2.86,65.47,4.1,130.93,2.65,196.42-.87,39.25-5.75,77.82-27.03,112.38-15.24,24.76-35.26,44.73-59.48,60.52-56.6,36.9-114.86,71.06-174.05,103.63-46.67,25.68-92.87,52.2-140.98,75.22-49.1,23.5-97.25,21.01-145.58-2.05-45.01-21.47-87.9-46.7-130.65-72.21-63-37.58-124.98-76.84-188.79-113.1-24.39-13.86-40.12-36.65-53.88-60.64-12.41-21.64-16.38-45.25-16.18-69.7.35-42.82-2.5-85.53-4.07-128.27-1.54-41.88-2.86-83.76-3.21-125.66Zm31.4,238.87c.95,41.38,14.17,79.3,45.36,110.15,12.51,12.38,28.73,18.64,43.47,27.28,74.35,43.57,146.4,90.98,221.81,132.76,30.54,16.92,60.63,34.83,94.23,45.39,25.82,8.11,51.58,7.62,77.19-1.12,33.28-11.35,63.42-29.21,93.92-46.16,77.12-42.85,152.24-89.12,227.86-134.51,36.12-21.68,64.04-50.23,73.96-92.99,4.97-21.41,6.09-43.24,6.53-65.01,1.14-56.18.34-112.37-1.58-168.54-.47-13.67-.16-27.38-.81-41.04-1.23-25.61-1.87-51.23.13-76.78,2.3-29.32-1.01-57.56-13.81-84.28-14.33-29.91-33.9-54.61-65.24-68.75-15.61-7.04-30.36-16.05-45.22-24.65-59.48-34.42-115.86-73.88-175.48-108.05-32.8-18.8-65.17-38.98-102.18-48.7-33.47-8.79-66.56-8.59-98.8,7.09-35.37,17.21-70,35.72-103.97,55.5-71.97,41.92-141.55,87.73-212.6,131.14-8.4,5.13-18.06,8.58-24.83,16.04-13.45,14.84-23.03,32.06-30.25,50.71-11.51,29.75-11.35,61.14-12.25,92.15-1.45,50.05,1.07,100.08,2.66,150.12,1.49,46.82,4.31,93.67-.11,142.24Z"
                      />
                      <path
                        fill="#000"
                        strokeWidth="0"
                        d="m655.28,682.51c0,87.38-.23,174.76.28,262.14.07,11.33-3.58,17.23-13.63,21.98-18.67,8.82-36.61,19.1-55.9,26.74-36.97,14.65-72.48,9.72-107.35-6.79-20.8-9.85-40.86-21.12-61.23-31.81-7.02-3.69-9.08-8.26-9.07-15.86.19-148.55.13-297.1.13-445.64,0-27.38-.72-54.78.17-82.13,1.35-41.26,19.85-73.44,54.38-96.17,7.53-4.96,15.46-9.32,23.34-13.71,12.16-6.78,16.92-17.52,16.43-31.25-.13-3.54-.11-7.08-.03-10.62.11-4.87-1.58-7.97-7-7.67-6.66.37-9.15-3.66-10.47-9.37-2.39-10.38-1.97-20.88-1.1-31.3.61-7.39,5.21-11.95,13.04-10.75,9.32,1.42,11.89-2.61,11.05-11.15-.54-5.48-.3-11.07-.07-16.59.25-6-2.4-8.41-8.33-8.27-9.32.21-18.65-.19-27.96.11-6.98.22-11.16-1.89-11.33-9.64-.12-5.51-1.32-10.99-1.39-16.5-.1-9.28,2.55-12.12,11.86-12.28,15.72-.27,31.46.04,47.18-.16,16.86-.21,33.78,1.09,50.58-1.64,3.41-.55,7-.35,10.47-.09,24.85,1.87,27.49,4.63,24.45,31.38-.71,6.21-4.16,9.07-10.62,8.9-10.19-.26-20.39.12-30.58-.08-6.8-.14-9.49,2.81-8.06,11.5.78,4.72.66,9.54,0,14.29-1.09,7.77,1.05,10.35,7.32,10.22,14.14-.3,16.31,1.92,16.59,15.81.16,8.15,0,16.31.07,24.46.06,6.12-2.45,10.34-8.8,10.89-5.79.5-7.4,3.67-7.06,8.77.04.57.02,1.5-.07,2.06-3.29,22.34,6.4,35.71,26.78,45.68,36.76,17.98,58.58,48.57,66.5,88.93,1.67,8.51-.39,16.82-.37,25.24.18,86.8.11,173.6.11,260.39-.11,0-.23,0-.34,0Z"
                      />
                      <path
                        fill="#000"
                        strokeWidth="0"
                        d="m688.27,826.6c2.29-68.35,3.67-136.71,3.7-205.12.01-25,12.68-45.91,32.53-61.19,7.29-5.61,8.55-10.4,6.29-18.92-8.82-33.19-16.83-66.59-25.1-99.92-3.25-13.1,1.24-18.32,14.53-16.58,4.58.6,9.11,1.93,13.55,3.31,8.77,2.72,13.98,7.98,15.33,17.86,3.82,27.95,8.77,55.75,12.6,83.71,1.14,8.29,3.85,8.49,18.64,7.77,8.19-.39,5.34-6.69,5.06-11.23-1.36-22.64-2.75-45.28-4.29-67.91-.45-6.57,1.83-9.64,8.85-9.5,15.14.3,30.29.25,45.43.03,6.93-.1,9.17,2.82,8.65,9.58-1.79,23.48-3.22,46.99-4.78,70.49-.28,4.26-.51,9.13,5.55,8.46,6.05-.67,14.94,4.73,17.02-6.37,2.85-15.15,5.43-30.36,8.16-45.53,2.62-14.6,4.93-29.28,8.03-43.78,2.65-12.4,28.77-22,39.26-14.8,4.01,2.76,4,6.77,2.93,10.97-8.55,33.86-16.69,67.83-25.9,101.51-2.72,9.95-1.85,16.51,6.4,23.5,19.59,16.61,27.17,39.23,29.12,64.18,3.45,44.2.31,88.51,2.11,132.68.89,21.9-7.89,36.11-24.35,48.49-22.21,16.7-46.6,29.77-70.23,44.08-41.59,25.18-83.45,49.9-125.21,74.79-8.6,5.13-9.97,4.51-14.15-4.69-5.54-12.2-7.25-25.28-7.69-38.3-.65-19.18-3.1-38.32-2.02-57.57Z"
                      />
                      <path
                        fill="#000"
                        strokeWidth="0"
                        d="m139.28,688.81c-.03-34.93-.05-69.88,3.83-104.65,2.58-23.19,10.99-43.96,27.79-60.73,14.23-14.2,32.05-20.7,51.45-23.57,6.9-1.02,13.89-1.62,20.85-1.91,5.25-.22,7.82-1.92,8.13-7.65,1.83-28.1,1.9-28.25,28.22-37.02,25.41-8.46,49.5-20.6,75.65-26.97,4.81-1.17,9.62-2.46,14.65-1.78,5.62.76,10.17,3.28,11.58,9.09,1.5,6.18-2.3,9.97-7.26,12.5-12.01,6.12-25.26,8.8-37.9,13.15-1.93.66-3.9,1.19-5.82,1.87-25.3,8.97-17.19,6.3-20.86,29.98-.88,5.7,3.1,6.86,7.43,7.44,12.98,1.75,25.99,3.2,38.78,6.21,9.66,2.27,19.21,4.82,28.34,8.74,6.78,2.91,10.65,7.84,10.76,15.46.14,10.5-5.12,14.97-15.39,12.89-17.93-3.63-35.15-10.37-53.68-11.53-13.17-.83-14.51-.14-14.56,13.4,0,2.33.18,4.68-.02,6.99-.56,6.31,1.84,9.28,8.49,10.47,12.45,2.22,23.92,7.44,34.15,14.93,15.2,11.15,23.64,25.56,23.58,45.2-.3,96.11-.12,192.22-.18,288.33,0,6.26,1.93,14.47-4.26,17.61-5.16,2.61-10.39-3.62-15.25-6.56-53.28-32.28-106.01-65.48-160.08-96.44-5.88-3.37-7.84-7.47-7.84-14.05,0-43.67,4.56-87.2,3.82-130.9-.36-21.25-.21-42.5-.78-63.76-.45-16.73,8.64-29.25,21.66-38.87,8.96-6.63,19.08-11.29,29.78-14.32,6.38-1.81,8.71-5.34,8.92-11.89.71-22.02-.21-23.02-22.17-19.69-27.98,4.23-47.48,23.91-52.84,53.08-6.58,35.81-5.39,71.86-3.78,107.96,1.16,26.15,3.06,52.28.35,78.5-1.64,15.85-2.03,17.43-12.03,17.69-12.57.34-20.16-6.23-21.35-18.91-1.5-15.95-2.45-31.92-2.24-47.96.14-10.77.03-21.55.03-32.33Z"/>
                    </svg>
                    {/* Logo PMS SVG */}
                    <svg
                      viewBox="0 0 1080 400"
                      style={{
                        width: "70px",
                        height: "auto",
                        display: "block",
                        margin: "0 auto 3px",
                      }}
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fill="#000"
                        strokeWidth="0"
                        d="m344.69,52.54c32.01,0,63.72-.66,95.38.29,14.6.44,24,9.93,29.75,23.54,21.13,50.06,42.61,99.97,64.08,149.89,1.43,3.32,1.52,7.62,6.81,10.11,4.89-11.17,9.87-22.18,14.54-33.31,16.73-39.87,33.7-79.65,49.88-119.74,9.21-22.82,24.49-33.3,49.63-31.76,23.91,1.47,47.99.32,72.03.32.25,5.1-2.97,6.35-5.22,8.13-29.8,23.66-46.53,70.35-32.66,104.12,8.45,20.56,9.54,40.53,9.48,61.52-.02,6.79-.19,12.36-8.99,14.69-8.84,2.34-9.96,10.84-9.65,18.84,1.37,35.98,15.72,64.92,46.39,84.93,2.18,1.43,4.88,2.34,6.24,6.62-9.08.79-17.98,2.7-26.69,2.1-18.03-1.25-35.89,1.07-53.83,1.26-9.73.11-13.72-3.91-13.68-13.73.25-60.85-1.35-121.71,1.54-182.54.12-2.58.74-5.4-2.39-8.03-5.89,7.6-8.42,16.76-12.01,25.24-17.17,40.51-34.12,81.12-50.87,121.81-6.28,15.24-17.23,22.41-33.61,22.84-17.23.45-29.63-6.12-36.39-22.27-18.17-43.41-36.28-86.85-54.49-130.26-2.64-6.31-5.64-12.46-10.27-18.54-.17,3.91-.49,7.83-.49,11.74,0,59.34-.24,118.68.33,178.02.11,11.81-3.9,15.71-15.2,15-11.06-.7-22.2-.23-33.3-.2-6.77.02-10.66-2.27-10.61-10.02.23-40.58-.46-81.18.55-121.73.35-13.98,9.67-26.24,11.62-40.53,6.7-48.93-3.43-91.28-44.92-122.33-1.5-1.12-3.25-2.08-2.98-6.02Z"
                      />
                      <path
                        fill="#000"
                        strokeWidth="0"
                        d="m727.64,256.04c3.06,0,6.16.29,9.18-.05,12.45-1.41,21.91.25,25.06,15.49,1.9,9.19,10.34,15.37,19,18.84,27.4,10.99,55.23,11.21,82.67.26,11.16-4.45,17.53-13.55,17.57-25.95.04-12.13-6.73-19.97-17.41-24.63-4.89-2.13-9.93-4.13-15.1-5.36-17.1-4.08-34.26-7.9-51.45-11.58-15-3.22-29.78-7.23-43.86-13.29-29.92-12.89-48.05-34.19-48.94-68.27-.98-37.57,14.51-65.98,48.45-81.45,40.49-18.46,82.85-18.54,123.94-1.8,33.73,13.74,51.24,41,55.22,77.09.71,6.39-1.71,9.41-8.12,9.4-14.55-.04-29.09-.07-43.64-.02-5.02.02-7.76-2.34-8.7-7.22-4.59-23.95-22.28-31.27-43.44-33.61-14.22-1.57-28.29-.12-41.86,4.73-13.06,4.67-20.5,13.58-20.8,24.61-.31,11.44,6.18,19.67,20.04,24.81,20.9,7.75,43.12,10.05,64.61,15.4,14.51,3.61,28.89,7.46,42.62,13.45,25.93,11.32,43.77,29.46,47.18,58.66,3.96,33.98-3.27,64.28-32.72,85.32-30.67,21.91-65.98,24.92-102.07,22.26-18.69-1.37-37.13-4.97-54.36-13.07-32.35-15.2-49.4-40.93-52.84-76.2-.52-5.32,1.16-7.97,6.79-7.85,7.65.15,15.31.04,22.97.04Z"
                      />
                      <path
                        fill="#000"
                        strokeWidth="0"
                        d="m139.47,203.9c0-44-.05-88,.02-132,.03-17,3.65-21.37,20.6-21.87,25.22-.75,50.5-1.4,75.66,1.35,16.01,1.75,31.82-1.72,48.03.09,52.39,5.85,85.3,38.19,91.44,91.01,2.78,23.9-.65,46.67-11,67.98-18.03,37.13-50.73,51.46-89.7,53.63-21.36,1.19-42.85.61-64.26.06-9.65-.25-12.61,3.3-12.38,12.66.53,21.41-.15,42.85.33,64.27.2,9.05-3.33,12.42-12.06,12.18-11.47-.31-22.97-.4-34.43.05-9.41.37-12.66-3.38-12.59-12.82.35-45.53.16-91.06.16-136.59h.17Zm58.49-45.36h.04c0,13.74.18,27.49-.08,41.23-.13,6.95,1.89,10.69,9.67,10.58,20.61-.3,41.26.59,61.83-.34,29.46-1.34,45.97-17.78,47.34-45.44,1.62-32.64-12.18-52.2-42.77-55.45-22.66-2.4-45.74-.79-68.63-.95-6.26-.04-7.46,3.99-7.44,9.15.05,13.74.02,27.49.02,41.23Z"
                      />
                    </svg>
                    {/* Phone Number */}
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: "800",
                        color: "#000",
                        marginTop: "2px",
                      }}
                    >
                      0985-920-400
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
          <div
            style={{
              border: "2px solid #000",
              borderRadius: 8,
              padding: 16,
              display: "inline-block",
              background: "#fff",
              boxShadow: "0 4px 12px rgba(0,0,0,.08)",
              marginBottom: 16,
            }}
          >
            <QRCodeSVG value={tuboUrl} size={180} level="M" />
            <div
              style={{
                marginTop: 10,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
                textAlign: "center",
                color: "#000",
              }}
            >
              {tubo.id}
            </div>
            <div
              style={{
                fontSize: 11,
                textAlign: "center",
                color: "var(--text-secondary)",
                marginTop: 2,
              }}
            >
              {tubo.gas} · {formatCapacidad(tubo)}
            </div>
            <div
              style={{
                fontSize: 11,
                textAlign: "center",
                fontWeight: "bold",
                color: "#000",
                marginTop: 4,
              }}
            >
              {tubo.propietario === "CLIENTE"
                ? `CLIENTE - ${tubo.propietarioCliente?.nombre || tubo.cliente?.nombre || "Desconocido"}`
                : (nombre_empresa || "PROPIO").toUpperCase()}
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
