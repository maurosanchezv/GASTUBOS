const fs = require('fs');
const filePath = '/home/machine/chobi-gas/GASTUBOS/frontend/src/pages/RepartoPage.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Declare state variables at the beginning of RepartoPage
const targetState = `  const [entregas, setEntregas] = useState([])`;
const replacementState = `  const [entregas, setEntregas] = useState([])
  const [modalDetalle, setModalDetalle] = useState(false)
  const [entregaSeleccionada, setEntregaSeleccionada] = useState(null)
  const [entregaParaImprimir, setEntregaParaImprimir] = useState(null)`;

if (!content.includes(targetState)) {
  console.error("Could not find targetState");
  process.exit(1);
}
content = content.replace(targetState, replacementState);

// 2. Update handlePrintClick to set entregaParaImprimir
const targetPrintClick = `  const handlePrintClick = (entrega) => {
    if (window.bluetoothSerial) {
      buscarImpresoras()
    } else {
      window.print()
    }
  }`;
const replacementPrintClick = `  const handlePrintClick = (entrega) => {
    setEntregaParaImprimir(entrega)
    if (window.bluetoothSerial) {
      buscarImpresoras()
    } else {
      window.print()
    }
  }`;

if (!content.includes(targetPrintClick)) {
  console.error("Could not find targetPrintClick");
  process.exit(1);
}
content = content.replace(targetPrintClick, replacementPrintClick);

// 3. Update printer modal Bluetooth call to use dynamic print target
const targetBtBtn = `onClick={() => imprimirBluetooth(activeEntrega, selectedDeviceAddress)}`;
const replacementBtBtn = `onClick={() => imprimirBluetooth(entregaParaImprimir || activeEntrega, selectedDeviceAddress)}`;

if (!content.includes(targetBtBtn)) {
  console.error("Could not find targetBtBtn");
  process.exit(1);
}
content = content.replace(targetBtBtn, replacementBtBtn);

// 4. Update createPortal to handle printing target dynamically
// Let's replace the whole createPortal block with dynamic target
const targetPortal = `{activeEntrega && createPortal(
        <div className="print-ticket-container">
          <div className="ticket-header">
            <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 'bold' }}>{(nombre_empresa || 'GasTubos').toUpperCase()}</h3>
            {direccion ? <p style={{ margin: 0, fontSize: '10px' }}>{direccion}</p> : <p style={{ margin: 0, fontSize: '10px' }}>Gestión de Gases Industriales</p>}
            {telefono && <p style={{ margin: '2px 0 0', fontSize: '10px' }}>Tel: {telefono}</p>}
            <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 'bold' }}>REMISIÓN: {activeEntrega.numero}</p>
          </div>
          
          <div style={{ margin: '8px 0', fontSize: '11px' }}>
            <strong>Cliente:</strong> {activeEntrega.cliente?.nombre}<br />
            <strong>RUC/CI:</strong> {activeEntrega.cliente?.ruc || '—'}<br />
            <strong>Dirección:</strong> {activeEntrega.direccionEntrega}<br />
            <strong>Fecha:</strong> {new Date(activeEntrega.fechaEntrega).toLocaleString('es-PY')}<br />
            <strong>Chofer:</strong> {activeEntrega.repartidor?.nombre || 'Sin asignar'}<br />
            <strong>Tipo:</strong> {activeEntrega.tipoOperacion.replace('_', ' ')}
          </div>
          
          <table className="ticket-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Tubo / Gas</th>
                <th style={{ textAlign: 'center' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {activeEntrega.detalles?.map(d => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.tuboId}</strong><br />
                    <span style={{ fontSize: '10px', color: '#555' }}>
                      {d.tubo?.gas} {d.tubo?.talla}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {Number(d.cantidadGas)} {d.unidadGas}<br />
                    <span style={{ fontSize: '9px', color: '#888' }}>
                      x {Number(d.precioUnitario).toLocaleString('es-PY')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '500' }}>
                    {Number(d.subtotal).toLocaleString('es-PY')}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px dashed #000' }}>
                <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>DELIVERY:</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>
                  {Number(activeEntrega.costoDelivery || 0).toLocaleString('es-PY')} GS
                </td>
              </tr>
              <tr>
                <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>TOTAL:</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px', color: 'var(--blue)' }}>
                  {(
                    (activeEntrega.detalles?.reduce((acc, d) => acc + Number(d.subtotal), 0) || 0) +
                    Number(activeEntrega.costoDelivery || 0)
                  ).toLocaleString('es-PY')} GS
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '12px 0', borderTop: '1px dashed #000', paddingTop: '8px' }}>
            <QRCodeSVG value={getRemisionUrl(activeEntrega.numero)} size={80} level="M" />
            <span style={{ fontSize: '9px', marginTop: '2px', fontFamily: 'monospace' }}>
              {activeEntrega.numero}
            </span>
          </div>
          
          {recambiosParaImprimir(activeEntrega).length > 0 && (
            <div style={{ margin: '8px 0', fontSize: '10px', borderTop: '1px dashed #000', paddingTop: '4px' }}>
              <strong>Recambios Recibidos:</strong>
              <ul style={{ paddingLeft: 14, margin: 0 }}>
                {recambiosParaImprimir(activeEntrega).map((desc, i) => (
                  <li key={i}>{desc}</li>
                ))}
              </ul>
            </div>
          )}

          {activeEntrega.observaciones && (
            <div style={{ margin: '8px 0', fontSize: '10px', fontStyle: 'italic', borderTop: '1px dashed #000', paddingTop: '4px' }}>
              <strong>Obs:</strong> {activeEntrega.observaciones}
            </div>
          )}
          
          <div className="ticket-signatures">
            <div className="signature-line">Firma Chofer</div>
            <div className="signature-line">Firma Cliente (Acuse)</div>
          </div>
          
          <div className="ticket-footer">
            ¡Gracias por su preferencia!
          </div>
        </div>,
        document.body
      )}`;

const replacementPortal = `{(entregaParaImprimir || activeEntrega) && createPortal(
        <div className="print-ticket-container">
          <div className="ticket-header">
            <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 'bold' }}>{(nombre_empresa || 'GasTubos').toUpperCase()}</h3>
            {direccion ? <p style={{ margin: 0, fontSize: '10px' }}>{direccion}</p> : <p style={{ margin: 0, fontSize: '10px' }}>Gestión de Gases Industriales</p>}
            {telefono && <p style={{ margin: '2px 0 0', fontSize: '10px' }}>Tel: {telefono}</p>}
            <p style={{ margin: '4px 0 0', fontSize: '11px', fontWeight: 'bold' }}>REMISIÓN: {(entregaParaImprimir || activeEntrega).numero}</p>
          </div>
          
          <div style={{ margin: '8px 0', fontSize: '11px' }}>
            <strong>Cliente:</strong> {(entregaParaImprimir || activeEntrega).cliente?.nombre}<br />
            <strong>RUC/CI:</strong> {(entregaParaImprimir || activeEntrega).cliente?.ruc || '—'}<br />
            <strong>Dirección:</strong> {(entregaParaImprimir || activeEntrega).direccionEntrega}<br />
            <strong>Fecha:</strong> {new Date((entregaParaImprimir || activeEntrega).fechaEntrega).toLocaleString('es-PY')}<br />
            <strong>Chofer:</strong> {(entregaParaImprimir || activeEntrega).repartidor?.nombre || 'Sin asignar'}<br />
            <strong>Tipo:</strong> {(entregaParaImprimir || activeEntrega).tipoOperacion.replace('_', ' ')}
          </div>
          
          <table className="ticket-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Tubo / Gas</th>
                <th style={{ textAlign: 'center' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(entregaParaImprimir || activeEntrega).detalles?.map(d => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.tuboId}</strong><br />
                    <span style={{ fontSize: '10px', color: '#555' }}>
                      {d.tubo?.gas} {d.tubo?.talla}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {Number(d.cantidadGas)} {d.unidadGas}<br />
                    <span style={{ fontSize: '9px', color: '#888' }}>
                      x {Number(d.precioUnitario).toLocaleString('es-PY')}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '500' }}>
                    {Number(d.subtotal).toLocaleString('es-PY')}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px dashed #000' }}>
                <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>DELIVERY:</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>
                  {Number((entregaParaImprimir || activeEntrega).costoDelivery || 0).toLocaleString('es-PY')} GS
                </td>
              </tr>
              <tr>
                <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>TOTAL:</td>
                <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px', color: 'var(--blue)' }}>
                  {(
                    ((entregaParaImprimir || activeEntrega).detalles?.reduce((acc, d) => acc + Number(d.subtotal), 0) || 0) +
                    Number((entregaParaImprimir || activeEntrega).costoDelivery || 0)
                  ).toLocaleString('es-PY')} GS
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '12px 0', borderTop: '1px dashed #000', paddingTop: '8px' }}>
            <QRCodeSVG value={getRemisionUrl((entregaParaImprimir || activeEntrega).numero)} size={80} level="M" />
            <span style={{ fontSize: '9px', marginTop: '2px', fontFamily: 'monospace' }}>
              {(entregaParaImprimir || activeEntrega).numero}
            </span>
          </div>
          
          {recambiosParaImprimir((entregaParaImprimir || activeEntrega)).length > 0 && (
            <div style={{ margin: '8px 0', fontSize: '10px', borderTop: '1px dashed #000', paddingTop: '4px' }}>
              <strong>Recambios Recibidos:</strong>
              <ul style={{ paddingLeft: 14, margin: 0 }}>
                {recambiosParaImprimir((entregaParaImprimir || activeEntrega)).map((desc, i) => (
                  <li key={i}>{desc}</li>
                ))}
              </ul>
            </div>
          )}

          {(entregaParaImprimir || activeEntrega).observaciones && (
            <div style={{ margin: '8px 0', fontSize: '10px', fontStyle: 'italic', borderTop: '1px dashed #000', paddingTop: '4px' }}>
              <strong>Obs:</strong> {(entregaParaImprimir || activeEntrega).observaciones}
            </div>
          )}
          
          <div className="ticket-signatures">
            <div className="signature-line">Firma Chofer</div>
            <div className="signature-line">Firma Cliente (Acuse)</div>
          </div>
          
          <div className="ticket-footer">
            ¡Gracias por su preferencia!
          </div>
        </div>,
        document.body
      )}`;

if (!content.includes(targetPortal)) {
  console.error("Could not find targetPortal exactly!");
  process.exit(1);
}
content = content.replace(targetPortal, replacementPortal);

// 5. Update history card rendering to trigger modalDetalle
const targetHistoryCard = `                      <div key={e.id} className="reparto-card" style={{ opacity: 0.85 }}>`;
const replacementHistoryCard = `                      <div 
                        key={e.id} 
                        className="reparto-card" 
                        style={{ opacity: 0.85, cursor: 'pointer' }}
                        onClick={() => {
                          setEntregaSeleccionada(e)
                          setModalDetalle(true)
                        }}
                      >`;

if (!content.includes(targetHistoryCard)) {
  console.error("Could not find targetHistoryCard");
  process.exit(1);
}
content = content.replace(targetHistoryCard, replacementHistoryCard);

// 6. Mount modalDetalle right before printer selection modal
const targetModalMount = `      {/* Modal para selección de Impresora Bluetooth (HM-A300E) */}
      <Modal
        open={printerModalOpen}`;

const replacementModalMount = `      {/* Modal de Detalle / Previsualización de Ticket desde Historial */}
      <Modal
        open={modalDetalle}
        title={\`Detalle de Entrega: \${entregaSeleccionada?.numero}\`}
        onClose={() => setModalDetalle(false)}
        width={400}
        footer={
          <div style={{ display: 'flex', gap: 10, width: '100%' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModalDetalle(false)}>
              Cerrar
            </button>
            <button 
              className="btn btn-primary" 
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} 
              onClick={() => handlePrintClick(entregaSeleccionada)}
            >
              <i className="ti ti-printer" /> Imprimir Remisión
            </button>
          </div>
        }
      >
        {entregaSeleccionada && (
          <div className="ticket-preview">
            <div className="ticket-header">
              <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 'bold' }}>{(nombre_empresa || 'GasTubos').toUpperCase()}</h3>
              {direccion ? <p style={{ margin: 0, fontSize: '10px', color: '#666' }}>{direccion}</p> : <p style={{ margin: 0, fontSize: '10px', color: '#666' }}>Gestión de Gases Industriales</p>}
              {telefono && <p style={{ margin: '2px 0 0', fontSize: '10px', color: '#666' }}>Tel: {telefono}</p>}
              <p style={{ margin: '6px 0 0', fontSize: '11px', fontWeight: 'bold' }}>REMISIÓN: {entregaSeleccionada.numero}</p>
            </div>
            
            <div style={{ margin: '10px 0', fontSize: '11px', borderBottom: '1px dashed #ddd', paddingBottom: '8px' }}>
              <strong>Cliente:</strong> {entregaSeleccionada.cliente?.nombre}<br />
              <strong>RUC/CI:</strong> {entregaSeleccionada.cliente?.ruc || '—'}<br />
              <strong>Dirección:</strong> {entregaSeleccionada.direccionEntrega}<br />
              <strong>Fecha:</strong> {new Date(entregaSeleccionada.fechaEntrega).toLocaleString('es-PY')}<br />
              <strong>Chofer:</strong> {entregaSeleccionada.repartidor?.nombre || 'Sin asignar'}<br />
              <strong>Tipo:</strong> {(entregaSeleccionada.tipoOperacion || '').replace('_', ' ')}
            </div>
            
            <table className="ticket-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ borderBottom: '1px dashed #000' }}>
                  <th style={{ textAlign: 'left', paddingBottom: '4px' }}>Tubo / Gas</th>
                  <th style={{ textAlign: 'center', paddingBottom: '4px' }}>Cant.</th>
                  <th style={{ textAlign: 'right', paddingBottom: '4px' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {entregaSeleccionada.detalles?.map(d => (
                  <tr key={d.id}>
                    <td style={{ paddingTop: '6px', paddingBottom: '4px' }}>
                      <strong>{d.tuboId}</strong><br />
                      <span style={{ fontSize: '10px', color: '#555' }}>
                        {d.tubo?.gas} {d.tubo?.talla}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', paddingTop: '6px', paddingBottom: '4px' }}>
                      {Number(d.cantidadGas)} {d.unidadGas}<br />
                      <span style={{ fontSize: '9px', color: '#888' }}>
                        x {Number(d.precioUnitario).toLocaleString('es-PY')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: '500', paddingTop: '6px', paddingBottom: '4px' }}>
                      {Number(d.subtotal).toLocaleString('es-PY')} GS
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '1px dashed #000' }}>
                  <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>DELIVERY:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', paddingTop: '6px' }}>
                    {Number(entregaSeleccionada.costoDelivery || 0).toLocaleString('es-PY')} GS
                  </td>
                </tr>
                <tr>
                  <td colSpan="2" style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px' }}>TOTAL:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '12px', color: 'var(--blue)' }}>
                    {(
                      (entregaSeleccionada.detalles?.reduce((acc, d) => acc + Number(d.subtotal), 0) || 0) +
                      Number(entregaSeleccionada.costoDelivery || 0)
                    ).toLocaleString('es-PY')} GS
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '14px 0', borderTop: '1px dashed #ddd', paddingTop: '10px' }}>
              <QRCodeSVG value={getRemisionUrl(entregaSeleccionada.numero)} size={80} level="M" />
              <span style={{ fontSize: '9px', color: '#666', marginTop: '4px', fontFamily: 'monospace' }}>
                {entregaSeleccionada.numero}
              </span>
            </div>
            
            {entregaSeleccionada.recambios && entregaSeleccionada.recambios.length > 0 && (
              <div style={{ margin: '8px 0', fontSize: '10px', borderTop: '1px dashed #ddd', paddingTop: '6px' }}>
                <strong style={{ display: 'block', marginBottom: 4 }}>Recambios Recibidos:</strong>
                <ul style={{ paddingLeft: 14, margin: 0, color: '#555' }}>
                  {entregaSeleccionada.recambios.map(r => {
                    const tubo = r.tuboEntregado
                    const desc = tubo.observaciones && (tubo.observaciones.includes(' ') || tubo.observaciones.length > 15)
                      ? tubo.observaciones 
                      : \`\${tubo.id} (\${tubo.gas} \${tubo.talla || ''})\`
                    return <li key={r.id}>{desc}</li>
                  })}
                </ul>
              </div>
            )}

            {entregaSeleccionada.observaciones && (
              <div style={{ margin: '8px 0', fontSize: '10px', fontStyle: 'italic', borderTop: '1px dashed #ddd', paddingTop: '6px', color: '#555' }}>
                <strong>Obs:</strong> {entregaSeleccionada.observaciones}
              </div>
            )}
            
            <div className="ticket-signatures" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', paddingTop: '10px' }}>
              <div className="signature-line" style={{ width: '45%', borderTop: '1px solid #000', textAlign: 'center', fontSize: '10px', paddingTop: '4px' }}>Firma Chofer</div>
              <div className="signature-line" style={{ width: '45%', borderTop: '1px solid #000', textAlign: 'center', fontSize: '10px', paddingTop: '4px' }}>Firma Cliente</div>
            </div>
            
            <div className="ticket-footer" style={{ textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '8px', marginTop: '16px', fontSize: '10px' }}>
              ¡Gracias por su preferencia!
            </div>
          </div>
        )}
      </Modal>

      {/* Modal para selección de Impresora Bluetooth (HM-A300E) */}
      <Modal
        open={printerModalOpen}`;

if (!content.includes(targetModalMount)) {
  console.error("Could not find targetModalMount");
  process.exit(1);
}
content = content.replace(targetModalMount, replacementModalMount);

fs.writeFileSync(filePath, content, 'utf8');
console.log("SUCCESS: RepartoPage history print and preview configured successfully!");
