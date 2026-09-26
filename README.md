# 💶 Mis Finanzas

App web de finanzas personales: varias cuentas, categorías editables, gastos,
ingresos y metas de ahorro, con sincronización en tiempo real entre
dispositivos (Firebase).

🔗 https://arandabarbadev.github.io/mis-finanzas/

## Qué hace

- 🔒 Login con Google — solo la cuenta de Rafa puede entrar
- 👛 Varias cuentas con color y saldo inicial; el saldo se calcula en vivo
  (saldo inicial + ingresos − gastos), nunca se guarda
- ➖ Gastos con categoría obligatoria; ➕ ingresos sin categoría
- 🏷️ Cuentas, categorías y metas editables desde ⚙️ Ajustes (con paleta de colores)
- 🎯 Metas de ahorro manuales con barra de progreso
- 📊 Gráficos: donut de gastos por categoría del mes + barras ingresos/gastos
  de los últimos 6 meses (Chart.js)
- 🕓 Historial por mes: toca un movimiento para editarlo
- ⚡ Todo se sincroniza al instante vía Firestore (`onSnapshot`)
- 📱 PWA instalable y abre offline (service worker)

## Técnica

- HTML/CSS/JS vanilla, sin frameworks
- Firebase v11 modular por CDN (mismo proyecto que mis otras apps: `deberes-e3282`)
- Chart.js 4.4.7 por CDN
- Datos en `/usuarios/{uid}/cuentas|categorias|movimientos|metas`
- La config de Firebase commiteada no es un secreto: es la dirección pública
  del proyecto. La seguridad la ponen las reglas + el filtro de usuario.

## Setup (solo la primera vez)

1. Firebase Console → Firestore Database → Reglas → pegar el contenido de
   [`firestore.rules`](firestore.rules) → **Publicar**
2. Ya está: el dominio `arandabarbadev.github.io` ya está autorizado en
   Authentication (lo usan mis otras apps)

---

*(La v1 con localStorage está guardada en la rama `version-local`.)*
