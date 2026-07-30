import { useState, useEffect } from 'react'
import { useConfigStore } from '../store/configStore.js'
import { PageHeader, FormGroup, useToast } from '../components/ui.jsx'
import { getBrandingSources } from '../utils/logosSvg.js'

export default function ConfiguracionPage() {
  const { nombre_empresa, direccion, telefono, isotipo_empresa, logo_empresa, updateConfig, loading } = useConfigStore()
  const { toast } = useToast()

  const [form, setForm] = useState({
    nombre_empresa: '',
    direccion: '',
    telefono: '',
    isotipo_empresa: '',
    logo_empresa: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm({
      nombre_empresa: nombre_empresa || 'Propio',
      direccion: direccion || '',
      telefono: telefono || '',
      isotipo_empresa: isotipo_empresa || '',
      logo_empresa: logo_empresa || '',
    })
  }, [nombre_empresa, direccion, telefono, isotipo_empresa, logo_empresa])

  const f = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleImageUpload = (field) => (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowed.includes(file.type)) {
      toast('Formato de imagen no permitido. Usá PNG, JPG, WEBP o SVG.', 'error')
      return
    }

    if (file.size > 1024 * 1024) {
      toast('La imagen no debe superar 1 MB de tamaño.', 'error')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setForm((prev) => ({ ...prev, [field]: String(reader.result) }))
    }
    reader.onerror = () => {
      toast('Error al leer el archivo de imagen', 'error')
    }
    reader.readAsDataURL(file)
  }

  const resetField = (field) => {
    setForm((prev) => ({ ...prev, [field]: '' }))
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

  const branding = getBrandingSources(form.isotipo_empresa, form.logo_empresa)

  return (
    <>
      <PageHeader title="Configuración de la Empresa" subtitle="Personalizá la marca, logos, dirección y datos para remisiones y códigos QR" />
      <div className="app-content">
        <div style={{ maxWidth: 680 }}>
          <form onSubmit={handleSubmit} className="card">
            <div className="card-title" style={{ marginBottom: 20 }}>Datos de Identidad y Marca</div>

            <div className="form-grid">
              <FormGroup label="Nombre de la Empresa (Marca)" hint="Reemplaza la palabra 'Propio' en listados de tubos y etiquetas QR" required>
                <input 
                  value={form.nombre_empresa} 
                  onChange={f('nombre_empresa')} 
                  placeholder="Ej: PMS, Cryopar, Chobi Gas" 
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

            {/* Sección de Logos */}
            <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Logos e Isotipo de la Empresa</div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                {/* Isotipo */}
                <div style={{ padding: 16, border: '1px dashed var(--border)', borderRadius: 'var(--radius)', textAlign: 'center', background: 'var(--surface-hover)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Isotipo (Símbolo / Icono)</div>
                  <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <img src={branding.isotipoSrc} alt="Vista previa Isotipo" style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      <i className="ti ti-upload" /> Subir Imagen
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleImageUpload('isotipo_empresa')} style={{ display: 'none' }} />
                    </label>
                    {form.isotipo_empresa && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => resetField('isotipo_empresa')} title="Restaurar por defecto">
                        <i className="ti ti-trash" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Logo Texto / Empresa */}
                <div style={{ padding: 16, border: '1px dashed var(--border)', borderRadius: 'var(--radius)', textAlign: 'center', background: 'var(--surface-hover)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Logo Completo (Nombre / Marca)</div>
                  <div style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <img src={branding.logoSrc} alt="Vista previa Logo" style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      <i className="ti ti-upload" /> Subir Imagen
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleImageUpload('logo_empresa')} style={{ display: 'none' }} />
                    </label>
                    {form.logo_empresa && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => resetField('logo_empresa')} title="Restaurar por defecto">
                        <i className="ti ti-trash" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
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
