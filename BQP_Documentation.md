# Buyer Qualification Platform (BQP)
## Documentación Completa del Sistema

---

## 1. Descripción General

SaaS para realtors que automatiza la calificación de compradores de vivienda mediante entrevistas guiadas por AI. El realtor crea un cliente, genera un link de entrevista, el buyer completa la entrevista conversacional con AI, y el sistema califica, genera reportes y recomienda acciones.

### Stack Tecnológico

| Componente | Tecnología |
|------------|-----------|
| Monorepo | pnpm workspaces (4 paquetes) |
| Backend | Fastify 5 + TypeScript |
| ORM | Prisma |
| Base de datos | PostgreSQL (Neon) |
| Frontend | React + Vite + TailwindCSS |
| AI Engine | OpenAI gpt-4o-mini (JSON mode) |
| Auth | JWT + bcrypt (cost 12) |
| Email | Nodemailer (SMTP) |
| Deploy | Vercel (frontend + serverless API) |

### Paquetes del Monorepo

```
packages/
├── shared/       → Enums, types, state machines, scoring, action engine
├── api/          → Fastify server, rutas, Prisma, email
├── ai-engine/    → Prompt builder, OpenAI client, respuesta validada
└── web/          → React SPA, páginas, auth context
```

---

## 2. Flujo Principal del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        FLUJO COMPLETO                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Realtor se registra/logea                                   │
│     └─→ JWT token generado                                      │
│                                                                 │
│  2. Realtor crea cliente                                        │
│     └─→ ClientWorkflow creado en status NEW                     │
│                                                                 │
│  3. Realtor genera link de entrevista                            │
│     └─→ Token único, expira en 14 días                          │
│     └─→ Workflow → INTERVIEW_SENT                               │
│                                                                 │
│  4. Buyer abre el link y chatea con AI                          │
│     └─→ AI extrae señales de cada respuesta                     │
│     └─→ Señales versionadas (supersededById)                    │
│     └─→ Barra de progreso visual para el buyer                  │
│                                                                 │
│  5. Backend decide terminar (checkCompletion.isComplete)         │
│     └─→ Buyer Score calculado automáticamente                   │
│     └─→ Pantalla "Your Home Buying Strategy" mostrada           │
│     └─→ Email de estrategia enviado al buyer                    │
│     └─→ Workflow → INTERVIEW_COMPLETE                           │
│                                                                 │
│  6. Realtor genera reporte                                      │
│     └─→ Scores recalculados, riesgos analizados                │
│     └─→ Acción recomendada (lender/consulta/follow-up)          │
│     └─→ Workflow → REPORT_READY                                 │
│                                                                 │
│  7. Realtor ejecuta acción                                      │
│     └─→ Workflow → ACTION_TAKEN → FOLLOW_UP → CLOSED           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Enums del Sistema

### InterviewSessionStatus
| Valor | Descripción |
|-------|-------------|
| `PENDING` | Link creado, buyer no ha iniciado |
| `IN_PROGRESS` | Buyer está respondiendo preguntas |
| `AWAITING_VALIDATION` | Conversación lista para cierre por reglas backend |
| `COMPLETED` | Entrevista finalizada y bloqueada |
| `EXPIRED` | Link expirado (14 días) |
| `ABANDONED` | Sesión inactiva, puede resumirse |

### MessageRole
| Valor | Descripción |
|-------|-------------|
| `SYSTEM` | Instrucciones del sistema |
| `ASSISTANT` | Respuestas del AI |
| `USER` | Mensajes del buyer |

### SignalCategory (7 categorías de información)
| Valor | Descripción |
|-------|-------------|
| `BUYER_IDENTITY` | Quién es (primer comprador, inversor, etc.) |
| `BUYER_MOTIVATION` | Por qué compra |
| `PROPERTY_PREFERENCE` | Qué busca |
| `FINANCIAL_READINESS` | Situación financiera |
| `BEHAVIORAL` | Comportamiento observado |
| `TIMELINE` | Cuándo quiere comprar |
| `ENGAGEMENT` | Nivel de compromiso |

### BuyerClassification (4 niveles)
| Valor | Score | Descripción |
|-------|-------|-------------|
| `HIGH_PROBABILITY` | >= 80 | Buyer altamente calificado |
| `ACTIVE_BUYER` | 60–79 | Buyer activo buscando |
| `EARLY_BUYER` | 40–59 | Etapa temprana |
| `RESEARCH_STAGE` | < 40 | Solo investigando |

### ReportStatus
| Valor | Descripción |
|-------|-------------|
| `PENDING` | Reporte creado, esperando generar |
| `GENERATING` | Calculando datos del reporte |
| `READY` | Reporte listo para el realtor |
| `EXPORTED` | Reporte enviado/exportado |
| `ERROR` | Error en generación |

### WorkflowStatus (7 pasos)
| Valor | Descripción |
|-------|-------------|
| `NEW` | Cliente recién agregado |
| `INTERVIEW_SENT` | Link de entrevista enviado |
| `INTERVIEW_COMPLETE` | Buyer completó la entrevista |
| `REPORT_READY` | Reporte generado |
| `ACTION_TAKEN` | Realtor ejecutó la acción recomendada |
| `FOLLOW_UP` | Cliente en secuencia de seguimiento |
| `CLOSED` | Workflow completado |

### RecommendedAction (3 acciones posibles)
| Valor | Descripción |
|-------|-------------|
| `SEND_TO_LENDER` | Buyer listo para introducción con lender |
| `SCHEDULE_CONSULTATION` | Necesita consulta para próximos pasos |
| `ADD_TO_FOLLOW_UP` | No está listo, nutrir con el tiempo |

---

## 4. Máquinas de Estado

### 4.1 Interview Session

```
PENDING ──→ IN_PROGRESS ──→ AWAITING_VALIDATION ──→ COMPLETED (bloqueado)
  │              │                    │
  │              ├──→ ABANDONED ──→ IN_PROGRESS (resume)
  │              │
  └──→ EXPIRED   └──→ EXPIRED

Nota: COMPLETED es estado terminal. ABANDONED puede resumirse.
```

**Reglas:**
- Una vez `COMPLETED`, la entrevista se bloquea y no puede editarse
- `PENDING` expira después de 14 días (configurable via `INTERVIEW_EXPIRY_DAYS`)
- El backend controla la completación via `checkCompletion` (señales requeridas + confidence mínima)
- Sesiones abandonadas pueden resumirse

### 4.2 Report

```
PENDING ──→ GENERATING ──→ READY ──→ EXPORTED (terminal)
                │
                └──→ ERROR ──→ GENERATING (reintento)
```

**Reglas:**
- Solo se generan de sesiones `COMPLETED`
- Generación incluye scoring, análisis de riesgos y recomendaciones

### 4.3 Workflow

```
NEW ──→ INTERVIEW_SENT ──→ INTERVIEW_COMPLETE ──→ REPORT_READY
                                                       │
                                                       ▼
                              CLOSED ←── FOLLOW_UP ←── ACTION_TAKEN
                                              │
                                              └──→ INTERVIEW_SENT (reiniciar)
                                              └──→ ACTION_TAKEN
```

**Reglas:**
- Se auto-inicia en `NEW` al crear cliente
- Transiciones se disparan automáticamente al completar entrevista/reporte
- Soporta múltiples ciclos de follow-up

---

## 5. Señales (Signals)

### 5.1 Señales Requeridas (7)

Para el tracking de progreso (barra visual). Confidence mínima: 0.5.

| Signal Key | Categoría | Ejemplo |
|------------|-----------|---------|
| `buyer_type` | BUYER_MOTIVATION | "first-time buyer", "relocating", "investor" |
| `motivation` | BUYER_MOTIVATION | "investment opportunity", "growing family" |
| `timeline` | TIMELINE | "3 months", "ASAP", "within a year" |
| `target_area` | PROPERTY_PREFERENCE | "Downtown Miami", "suburbs" |
| `property_type` | PROPERTY_PREFERENCE | "single-family", "condo", "townhome" |
| `financing_intent` | FINANCIAL_READINESS | "conventional mortgage", "FHA", "cash" |
| `financial_indicator` | FINANCIAL_READINESS | "$80k savings", "pre-approved $350k" |

### 5.2 Señales Opcionales

| Signal Key | Categoría | Descripción |
|------------|-----------|-------------|
| `budget_range` | FINANCIAL_READINESS | Rango de precio |
| `preapproval_status` | FINANCIAL_READINESS | Sí/No/Pendiente |
| `down_payment` | FINANCIAL_READINESS | Monto o porcentaje |
| `bedrooms` | PROPERTY_PREFERENCE | Número deseado |
| `bathrooms` | PROPERTY_PREFERENCE | Número deseado |
| `must_haves` | PROPERTY_PREFERENCE | Requisitos obligatorios |
| `deal_breakers` | PROPERTY_PREFERENCE | Lo que no acepta |
| `engagement_level` | ENGAGEMENT | Nivel de seriedad |

### 5.3 Versionado de Señales

Cuando una señal se re-extrae (buyer corrige info):
1. Se crea nueva versión con `version + 1`
2. La versión anterior se marca con `supersededById` → ID de la nueva
3. Las consultas siempre usan `supersededById: null` para obtener la más reciente

### 5.4 Confidence

| Rango | Significado |
|-------|-------------|
| 0.9–1.0 | Declaración explícita del buyer |
| 0.5–0.7 | Información implícita o algo vaga |
| 0.3–0.5 | Interpretación incierta |

---

## 6. Sistema de Scoring

### 6.1 Componentes y Pesos

| Componente | Peso | Fuente |
|------------|------|--------|
| **Motivation Score** | 30% | Promedio confidence × 100 de señales BUYER_MOTIVATION |
| **Financial Readiness** | 35% | Promedio confidence × 100 de señales FINANCIAL_READINESS |
| **Engagement Score** | 15% | Promedio confidence × 100 de señales ENGAGEMENT |
| **Timeline Score** | 20% | Promedio confidence × 100 de señales TIMELINE |

### 6.2 Fórmula

```
Para cada categoría:
  score = promedio(confidence de señales de esa categoría × 100)
  Si no hay señales en la categoría: score = 50 (default)
  Clamped a rango [0, 100]

Buyer Probability Score =
    Motivation Score × 0.30 +
    Financial Readiness × 0.35 +
    Engagement Score × 0.15 +
    Timeline Score × 0.20

Resultado redondeado a 2 decimales.
```

### 6.3 Clasificación

```
Score >= 80  →  HIGH_PROBABILITY
Score >= 60  →  ACTIVE_BUYER
Score >= 40  →  EARLY_BUYER
Score <  40  →  RESEARCH_STAGE
```

### 6.4 Ejemplo de Cálculo

```
Señales BUYER_MOTIVATION:  confidence 0.9, 0.8  → avg = 85  × 0.30 = 25.50
Señales FINANCIAL_READINESS: confidence 0.6, 0.7 → avg = 65  × 0.35 = 22.75
Señales ENGAGEMENT:          confidence 0.95      → avg = 95  × 0.15 = 14.25
Señales TIMELINE:            confidence 0.8       → avg = 80  × 0.20 = 16.00

Buyer Score = 25.50 + 22.75 + 14.25 + 16.00 = 78.50 → ACTIVE_BUYER
```

### 6.5 Cuándo se calcula

- **En vivo**: El dashboard calcula el score desde señales actuales (sin guardarlo)
- **Al completar entrevista**: Se guarda `ScoringResult` permanente
- **Al generar reporte**: Se recalcula y se actualiza `ScoringResult`

---

## 7. Action Engine (Motor de Acciones)

Sistema determinístico de 6 reglas evaluadas en orden. **Primera coincidencia gana.**

### Regla 1: Filtro de Riesgo (PRIORIDAD MÁS ALTA)
- **SI** >= 3 indicadores de riesgo
- **ACCIÓN**: `ADD_TO_FOLLOW_UP`
- **Confianza**: HIGH
- **Razón**: Múltiples riesgos; follow-up para abordar preocupaciones

### Regla 2: Buyer Premium
- **SI** clasificación = `HIGH_PROBABILITY` Y claridad financiera ≠ LOW Y (tiene pre-aprobación O financial readiness >= 60)
- **ACCIÓN**: `SEND_TO_LENDER`
- **Confianza**: HIGH
- **Razón**: Buyer de alta probabilidad con indicadores financieros sólidos

### Regla 3: Buyer Activo + Timeline Corto
- **SI** clasificación = `ACTIVE_BUYER` Y timeline <= 6 meses
- **ACCIÓN**: `SCHEDULE_CONSULTATION`
- **Confianza**: MEDIUM
- **Razón**: Buyer activo con timeline de 6 meses; agendar consulta

### Regla 4: Buyer Activo + Problema Financiero
- **SI** clasificación = `ACTIVE_BUYER` Y claridad financiera = LOW
- **ACCIÓN**: `SCHEDULE_CONSULTATION`
- **Confianza**: MEDIUM
- **Razón**: Buyer activo pero claridad financiera baja

### Regla 5: Etapa Temprana
- **SI** clasificación = `EARLY_BUYER` O `RESEARCH_STAGE`
- **ACCIÓN**: `ADD_TO_FOLLOW_UP`
- **Confianza**: MEDIUM
- **Razón**: Buyer en etapa temprana; nutrir con follow-up

### Regla 6: Default
- **ACCIÓN**: `SCHEDULE_CONSULTATION`
- **Confianza**: LOW
- **Razón**: Recomendación por defecto

### Claridad Financiera

```
HIGH:   >= 4 señales de [financing_intent, financial_indicator, budget_range,
         preapproval_status, down_payment]
MEDIUM: >= 2 señales
LOW:    < 2 señales
```

### Indicadores de Riesgo

| Indicador | Severidad | Condición |
|-----------|-----------|-----------|
| Low Financial Clarity | HIGH | < 2 señales financieras |
| Uncertain Timeline | MEDIUM | Timeline contiene "not sure" |
| No Pre-approval | MEDIUM | preapproval_status = "no" |

---

## 8. AI Engine

### 8.1 Configuración

| Parámetro | Valor |
|-----------|-------|
| Modelo | gpt-4o-mini (configurable via `OPENAI_MODEL`) |
| max_tokens | 2048 |
| temperature | 0.7 |
| response_format | JSON mode |

### 8.2 Personalidad del AI

- **Tono**: Amigable, profesional, cálido, humano
- **Enfoque**: Conversación natural, NO como checklist
- **Presión**: Cero presión, no insistente con detalles financieros
- **Ritmo**: UNA pregunta a la vez, nunca bombardear
- **Transparencia**: NUNCA mencionar scoring, calificación, pilares o evaluación

### 8.3 Los 5 Pilares de Calificación

1. **Motivation** — ¿Por qué compran? (primera vez, reubicación, inversión, upgrade)
2. **Timeline** — ¿Cuándo? (urgencia, vencimiento de lease, deadlines)
3. **Property Preferences** — ¿Qué buscan? (ubicación, tipo, tamaño, must-haves)
4. **Financial Readiness** — ¿Están preparados? (pre-aprobación, down payment, financiamiento)
5. **Engagement** — ¿Qué tan serios? (otros agentes, open houses, responsividad)

### 8.4 Manejo de Idioma

- **Default**: Inglés, a menos que el buyer escriba en otro idioma
- **Forzado**: Si el realtor especifica `preferredLanguage`, TODAS las respuestas en ese idioma

### 8.5 Completación de Entrevista

El backend es la **única autoridad** sobre cuándo termina la entrevista:
- La API calcula completación con `checkCompletion()` sobre señales requeridas
- El modelo puede sugerir cierre con `completion_candidate: true`, pero no cierra por sí solo
- La barra de progreso refleja cobertura de señales y acompaña la conversación
- El cierre oficial ocurre cuando las reglas backend permiten transición a `COMPLETED`

### 8.6 Formato de Respuesta (JSON)

```json
{
  "reply": "Mensaje conversacional para el buyer",
  "extracted_signals": [
    {
      "signal_key": "nombre_descriptivo",
      "signal_category": "BUYER_MOTIVATION | PROPERTY_PREFERENCE | ...",
      "value": "valor extraído",
      "confidence": 0.0 a 1.0
    }
  ],
  "completion_candidate": false
}
```

Notas:
- `completion_candidate` es sugerencia conversacional del modelo.
- El backend decide la completación oficial.
- `current_pillar` y `pillars_touched` pueden existir por compatibilidad histórica, pero no gobiernan cierre.

---

## 9. Schema de Base de Datos

### 9.1 Realtor
| Campo | Tipo | Notas |
|-------|------|-------|
| id | CUID (PK) | Auto-generado |
| email | String (UNIQUE) | Login |
| name | String | Nombre completo |
| phone | String? | Opcional |
| company | String? | Opcional |
| passwordHash | String | bcrypt cost 12 |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### 9.2 Client
| Campo | Tipo | Notas |
|-------|------|-------|
| id | CUID (PK) | Auto-generado |
| realtorId | FK → Realtor | Owner |
| name | String | Nombre del buyer |
| email | String? | Para emails |
| phone | String? | Contacto |
| leadSource | String? | Origen del lead |
| preferredLanguage | String | Default: "en" |
| notes | String? | Notas del realtor |

### 9.3 InterviewSession
| Campo | Tipo | Notas |
|-------|------|-------|
| id | CUID (PK) | |
| clientId | FK → Client | |
| token | String (UNIQUE) | UUID para acceso público |
| status | Enum | InterviewSessionStatus |
| expiresAt | DateTime | 14 días desde creación |
| lockedAt | DateTime? | Cuando se completó |
| startedAt | DateTime? | Primer mensaje del buyer |
| completedAt | DateTime? | Cuando terminó |
| lastActivityAt | DateTime? | Último mensaje |
| completionPercent | Float | 0-100, tracking de señales |
| lastAnsweredPillar | String? | Último pilar discutido |
| timeSpentSeconds | Int | Duración total |

### 9.4 InterviewMessage
| Campo | Tipo | Notas |
|-------|------|-------|
| id | CUID (PK) | |
| interviewSessionId | FK | |
| role | Enum | SYSTEM, ASSISTANT, USER |
| content | String | Texto del mensaje |
| pillar | String? | Pilar en discusión |
| sequenceNumber | Int | Orden en conversación |

### 9.5 ExtractedSignal
| Campo | Tipo | Notas |
|-------|------|-------|
| id | CUID (PK) | |
| interviewSessionId | FK | |
| signalCategory | Enum | SignalCategory |
| signalKey | String | e.g., "buyer_type" |
| signalValue | String | Valor extraído |
| confidence | Float | 0.0–1.0 |
| sourceMessageId | String? | De qué mensaje |
| version | Int | Empieza en 1 |
| supersededById | String? | Apunta a versión nueva |

### 9.6 ScoringResult
| Campo | Tipo | Notas |
|-------|------|-------|
| id | CUID (PK) | |
| interviewSessionId | FK (UNIQUE) | 1:1 con session |
| motivationScore | Float | 0–100 |
| financialReadiness | Float | 0–100 |
| engagementScore | Float | 0–100 |
| timelineScore | Float | 0–100 |
| buyerProbabilityScore | Float | Compuesto 0–100 |
| classification | Enum | BuyerClassification |
| inputSignalSnapshot | JSON | Snapshot de señales usadas |

### 9.7 Report
| Campo | Tipo | Notas |
|-------|------|-------|
| id | CUID (PK) | |
| clientId | FK | |
| status | Enum | ReportStatus |
| reportData | JSON? | Payload completo del reporte |
| lenderSnapshot | JSON? | Resumen para lender |
| generatedAt | DateTime? | |

**Estructura de reportData:**
- `quickSnapshot` — nombre, clasificación, score, acción, riesgos
- `buyerProfile` — tipo, motivación, timeline, nivel de engagement
- `financialSnapshot` — presupuesto, pre-aprobación, down payment, financiamiento, claridad
- `propertyPreferences` — área, tipo, must-haves, deal-breakers
- `scores` — los 4 scores + compuesto
- `riskIndicators` — lista con severidad
- `aiRecommendation` — acción, razón, confianza
- `summary` — narrativa
- `mlsCriteria` — parámetros de búsqueda MLS
- `consultationNotes` — puntos de conversación

### 9.8 ClientWorkflow
| Campo | Tipo | Notas |
|-------|------|-------|
| id | CUID (PK) | |
| clientId | FK (UNIQUE) | 1:1 con client |
| status | Enum | WorkflowStatus, default: NEW |
| recommendedAction | Enum? | RecommendedAction |
| actionExecutedAt | DateTime? | Cuando se ejecutó |
| actionNotes | String? | Notas del realtor |

---

## 10. API Endpoints

### 10.1 Autenticación

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/auth/register` | No | Registro. Body: `{email, password (min 8), name, phone?, company?}`. Returns: `{token, user}` |
| `POST` | `/auth/login` | No | Login. Body: `{email, password}`. Returns: `{token, user}` |
| `GET` | `/auth/me` | Sí | Perfil del realtor autenticado |

### 10.2 Clientes

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/clients` | Sí | Crear cliente + workflow NEW. Body: `{name, email?, phone?, leadSource?, preferredLanguage?, notes?}` |
| `GET` | `/clients` | Sí | Listar clientes del realtor |
| `GET` | `/clients/:id` | Sí | Detalle con workflows, sesiones (con señales), reportes |
| `PATCH` | `/clients/:id` | Sí | Actualizar datos del cliente |
| `DELETE` | `/clients/:id` | Sí | Eliminar cliente + cascada (scores, señales, mensajes, sesiones, reportes, workflow) |

### 10.3 Entrevistas

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/clients/:clientId/interviews` | Sí | Crear sesión. Max 1 activa por cliente. Returns: `{session, interviewUrl}` |
| `GET` | `/interviews/:token` | No | Obtener entrevista. Si completada, incluye `buyerStrategy` |
| `POST` | `/interviews/:token/messages` | No | Enviar mensaje. Procesa AI, extrae señales, verifica completación |
| `GET` | `/interviews/:token/status` | No | Status y % de completación |

### 10.4 Reportes

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `POST` | `/clients/:clientId/reports/generate` | Sí | Generar reporte completo desde entrevista completada |
| `GET` | `/clients/:clientId/reports/:reportId` | Sí | Ver reporte con datos y lender snapshot |
| `GET` | `/clients/:clientId/reports/:reportId/lender-snapshot` | Sí | Solo el snapshot para lender |

### 10.5 Workflow

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/clients/:clientId/workflow` | Sí | Ver workflow actual |
| `POST` | `/clients/:clientId/workflow/execute` | Sí | Ejecutar acción recomendada. Body: `{actionNotes?}` |

### 10.6 Dashboard

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| `GET` | `/dashboard/summary` | Sí | Conteos: total clientes, entrevistas activas, reportes listos, alta prioridad |
| `GET` | `/dashboard/clients?status=X` | Sí | Lista con scores en vivo, señales, filtro por workflow status |

---

## 11. Pantallas del Frontend

### Públicas
| Ruta | Pantalla | Descripción |
|------|----------|-------------|
| `/login` | Login | Email + password del realtor |
| `/register` | Register | Formulario de registro |
| `/interview/:token` | Interview | Chat AI + pantalla de estrategia al completar |

### Protegidas (requieren JWT)
| Ruta | Pantalla | Descripción |
|------|----------|-------------|
| `/` | Dashboard | Cards de resumen, lista de clientes con Buyer Score en vivo, barras por categoría, filtro por status, menú Actions |
| `/clients/new` | Create Client | Formulario + modal para compartir link (copy/email/SMS) |
| `/clients/:id` | Client Detail | Layout estilo reporte con scores, perfil, summary, lender snapshot, MLS criteria, consultation notes |
| `/clients/:clientId/reports/:reportId` | Report View | Reporte completo generado |

### Pantalla de Estrategia (Buyer-facing)

Cuando la entrevista se completa, el buyer ve:
- **Header**: Gradiente azul con "Your Home Buying Strategy" + nombre + perfil
- **Timeline & Price**: Cards con timeline y rango de precio
- **Property Preferences**: Tipo, área, preferencias
- **Next Steps**: Lista numerada personalizada (lender, listings, consulta)
- **Realtor Message**: Mensaje personalizado del realtor en caja amarilla
- **CTAs**: Confirmación de email enviado

---

## 12. Email de Completación

### Cuándo se envía
- Automáticamente al completar entrevista (cuando backend marca `COMPLETED`)
- Async, fire-and-forget (errores se loguean, no bloquean)
- Solo si el buyer tiene email

### Configuración
- SMTP via variables de entorno (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`)
- Si SMTP no configurado, se loguea en consola

### Contenido del Email
- **Subject**: "🏠 Your Home Buying Strategy - {buyerName}"
- **Header**: Gradiente azul con nombre y perfil
- **Timeline + Price Range**: Dos columnas
- **Property Preferences**: Tipo, área, nota
- **Next Steps**: Lista numerada con badges
- **Realtor Message**: Cita personalizada en caja amarilla
- **Realtor Info**: Nombre, empresa, email, teléfono

---

## 13. Variables de Entorno

### Requeridas
| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Connection string PostgreSQL (Neon) |
| `OPENAI_API_KEY` | API key de OpenAI |
| `JWT_SECRET` | Secreto para firmar tokens JWT |
| `APP_URL` | URL pública de la app (para links de entrevista) |

### Opcionales
| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 3000 | Puerto del servidor API |
| `HOST` | 0.0.0.0 | Host del servidor |
| `CORS_ORIGIN` | true (all) | Origen permitido para CORS |
| `OPENAI_MODEL` | gpt-4o-mini | Modelo de OpenAI |
| `INTERVIEW_EXPIRY_DAYS` | 14 | Días hasta expiración de entrevista |
| `SMTP_HOST` | — | Host SMTP para emails |
| `SMTP_PORT` | 587 | Puerto SMTP |
| `SMTP_USER` | — | Usuario SMTP |
| `SMTP_PASS` | — | Password SMTP |

---

## 14. Reglas de Negocio Clave

1. **Máximo 1 entrevista activa por cliente** — Debe completar/abandonar antes de crear nueva
2. **Expiración de entrevista**: 14 días — Auto-marcada como EXPIRED al acceder
3. **Versionado de señales** — Señales se versionan, nunca se borran; queries usan `supersededById: null`
4. **Completación la decide el backend** — `checkCompletion` dispara el cierre oficial; `completion_candidate` solo sugiere
5. **Barra de progreso es solo visual** — Basada en señales requeridas, no determina completación
6. **Score se calcula en vivo** — Dashboard muestra score desde señales actuales sin necesidad de reporte
7. **Eliminación en cascada** — Borrar cliente elimina todo: sesiones, mensajes, señales, scores, reportes, workflow
8. **Generación de reportes solo de entrevistas completadas** — Requiere session `COMPLETED`
9. **Acciones determinísticas** — Motor de reglas sin AI; solo la entrevista usa AI
10. **Transiciones validadas** — Toda transición de estado se valida; transiciones inválidas retornan 409
11. **Email non-blocking** — Fallas de email se loguean pero no impactan la respuesta
12. **Idioma del buyer** — Si el realtor especifica idioma, toda la entrevista se conduce en ese idioma

---

*Documentación generada para el proyecto Buyer Qualification Platform (BQP)*
*Última actualización: Abril 2026*
