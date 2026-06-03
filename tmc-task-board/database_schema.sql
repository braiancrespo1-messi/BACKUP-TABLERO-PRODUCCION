-- ====================================================================
-- DATABASE SCHEMA DESIGN - TMC TASK BOARD (PANEL DE TAREAS)
-- ====================================================================
-- This file documents both PostgreSQL (Supabase) and NoSQL (Firebase Firestore)
-- structures to accommodate TMC's cloud database stack.
-- ====================================================================

-- ====================================================================
-- OPTION A: SUPABASE / POSTGRESQL SCHEMA
-- ====================================================================

-- 1. Enums Definitions
CREATE TYPE task_type AS ENUM ('Insumo', 'Cobranza', 'Trámite');
CREATE TYPE task_status AS ENUM ('Solicitado', 'En Proceso', 'Listo para Retirar', 'En Reparto', 'Completado');

-- 2. Tasks Table Schema
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo task_type NOT NULL,
    descripcion TEXT NOT NULL,
    origen VARCHAR(100) NOT NULL,            -- e.g., 'Fábrica', 'Compras', 'Administración'
    direccion TEXT NOT NULL,
    latitud NUMERIC(10, 8),
    longitud NUMERIC(11, 8),
    yiqi_instance_id VARCHAR(50),            -- ID reference to YiQi ERP document
    estado task_status NOT NULL DEFAULT 'Solicitado',
    chofer_id VARCHAR(100) DEFAULT NULL,    -- Driver ID assigned (e.g. from CALLE)
    comentarios_chofer TEXT DEFAULT NULL,
    firma_url TEXT DEFAULT NULL,             -- URL link to cloud storage signature
    remito_foto_url TEXT DEFAULT NULL,       -- URL link to cloud storage delivery note
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Trigger to Auto-update actualizado_en Timestamp
CREATE OR REPLACE FUNCTION update_actualizado_en_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tasks_actualizado_en
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_actualizado_en_column();

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_estado ON public.tasks (estado);
CREATE INDEX IF NOT EXISTS idx_tasks_chofer_estado ON public.tasks (chofer_id, estado);
CREATE INDEX IF NOT EXISTS idx_tasks_creado_en ON public.tasks (creado_en DESC);

-- 5. Row-Level Security (RLS) Policies
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated drivers and office staff
CREATE POLICY "Allow read access to all authenticated users"
ON public.tasks FOR SELECT
TO authenticated
USING (true);

-- Allow office staff (admin role) full control
CREATE POLICY "Allow full write access to admins"
ON public.tasks FOR ALL
TO authenticated
USING (auth.jwt() ->> 'role' = 'service_role' OR auth.jwt() ->> 'role' = 'admin')
WITH CHECK (true);

-- Allow drivers to update tasks assigned to them or tasks in 'Listo para Retirar' state
CREATE POLICY "Allow drivers to update assigned tasks"
ON public.tasks FOR UPDATE
TO authenticated
USING (
    estado = 'Listo para Retirar' 
    OR chofer_id = auth.uid()::text
)
WITH CHECK (
    estado IN ('En Reparto', 'Completado')
);


-- ====================================================================
-- OPTION B: FIREBASE FIRESTORE DATA LAYOUT & RULES
-- ====================================================================

/*
1. Colección: `tasks`
   Document ID: Generado automáticamente (ej: "LhG84YfDq01Rks9k1p91")

   Esquema de Documento (JSON Modelo):
   {
     "tipo": "Insumo",                                              // String: ["Insumo", "Cobranza", "Trámite"]
     "descripcion": "Retirar 50kg de chapa de proveedor LozaMetal",   // String
     "origen": "Fábrica",                                           // String: Sector solicitante
     "direccion": "Av. General Paz 12450, Lomas del Mirador",        // String
     "coordenadas": {                                               // GeoPoint (objeto nativo Firestore)
       "latitude": -34.661245,
       "longitude": -58.532155
     },
     "yiqi_instance_id": "27962",                                   // String (Opcional, ref a YiQi ERP)
     "estado": "Listo para Retirar",                                // String: ["Solicitado", "En Proceso", "Listo para Retirar", "En Reparto", "Completado"]
     "chofer_id": "chofer_carlos_01",                               // String (Opcional, chofer asignado)
     "comentarios_chofer": "Se retiró todo en tiempo y forma.",     // String (Opcional)
     "firma_url": "https://firebasestorage.googleapis.com/.../sig.png", // String (Opcional)
     "remito_foto_url": "https://firebasestorage.googleapis.com/.../remito.jpg", // String (Opcional)
     "creado_en": "2026-05-30T17:00:00Z",                            // Timestamp (fecha creación)
     "actualizado_en": "2026-05-30T17:45:00Z"                       // Timestamp (fecha actualización)
   }

2. Reglas de Seguridad (firestore.rules):
   ----------------------------------------
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       
       // Reglas para la colección de tareas
       match /tasks/{taskId} {
         // Permitir lectura a cualquier usuario autenticado de la empresa
         allow read: if request.auth != null;
         
         // Permitir creación y borrado solo a administradores/oficina
         allow create, delete: if request.auth != null && request.auth.token.admin == true;
         
         // Permitir actualizaciones:
         // - Los administradores pueden cambiar todo.
         // - Los choferes pueden cambiar el estado a 'En Reparto' o 'Completado'
         //   si la tarea estaba libre (Listo para Retirar) o si ya la tenían asignada.
         allow update: if request.auth != null && (
           request.auth.token.admin == true ||
           (
             // Chofer reclama la tarea pasándola a 'En Reparto'
             (resource.data.estado == 'Listo para Retirar' && request.resource.data.estado == 'En Reparto' && request.resource.data.chofer_id == request.auth.uid) ||
             // Chofer completa la tarea asignada
             (resource.data.chofer_id == request.auth.uid && resource.data.estado == 'En Reparto' && request.resource.data.estado == 'Completado')
           )
         );
       }
       
     }
   }
*/
