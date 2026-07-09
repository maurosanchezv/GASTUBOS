// gastubos/frontend/src/pages/ConfiguracionPage.jsx
import { useState, useEffect } from 'react'
import { useConfigStore } from '../store/configStore.js'
import { PageHeader, FormGroup, useToast } from '../components/ui.jsx'

export default function ConfiguracionPage() {
  const { nombre_empresa, direccion, telefono, updateConfig, loading } = useConfigStore()
  const { toast } = useToast()

  const [form, setForm] = useState({
    nombre_empresa: '',
    direccion: '',
    telefono: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      nombre_empresa: nombre_empresa || 'Propio',
      direccion: direccion || '',
      telefono: telefono || '',
    })
  }, [nombre_empresa, direccion, telefono])

  const f = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    const res = await updateConfig(form)
    if (res.ok) {
      toast('Configuración guardada correctamente', 'success')
    } else {
      toast(res.error || 'Error al guardar la configuración', 'error')
    }
    setSaving(false)
  }

  return (
    <>
      <PageHeader title="Configuración de la Empresa" subtitle="Personalizá la marca, dirección y datos para remisiones y códigos QR" />
      <div className="app-content">
        <div style={{ maxWidth: 600 }}>
          <form onSubmit={handleSubmit} className="card">
            <div className="card-title" style={{ marginBottom: 20 }}>Datos de Identidad y Marca</div>
            
            <div className="form-grid">
              <FormGroup label="Nombre de la Empresa (Marca)" hint="Reemplaza la palabra 'Propio' en listados de tubos y etiquetas QR" required>
                <input 
                  value={form.nombre_empresa} 
                  onChange={f('nombre_empresa')} 
                  placeholder="Ej: Mauro, Chobi Gas" 
                  required 
                />
              </FormGroup>

              <FormGroup label="Dirección / Planta" hint="Se imprimirá en el encabezado de las remisiones">
                <input 
                  value={form.direccion} 
                  onChange={f('direccion')} 
                  placeholder="Ej: Avda. Principal 123, Asunción" 
                />
              </FormGroup>

              <FormGroup label="Teléfono de Contacto" hint="Se imprimirá en el encabezado de las remisiones">
                <input 
                  value={form.telefono} 
                  onChange={f('telefono')} 
                  placeholder="Ej: +595 981 123456" 
                />
              </FormGroup>
            </div>

            <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={saving || loading}>
                {saving ? 'Guardando...' : <><i className="ti ti-device-floppy" /> Guardar Cambios</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
