// ================= CONFIG =================
const CONFIG = {
  whatsappPhone: "5491123219676", // sin + ni espacios
  googleMapsApiKey: "", // <-- pegá tu API KEY acá
  googleGeocodeRegion: "AR"
};

// ================= DATA =================
let menu = null; // se carga desde menu.json

async function loadMenu() {
  if (menu) return menu;

  // 1) Preferir menú embebido (funciona con file://)
  try {
    const fromGlobal = globalThis?.LDVG_MENU;
    if (fromGlobal && typeof fromGlobal === 'object') {
      menu = fromGlobal;
      return menu;
    }
  } catch (e) {
    // ignore
  }

  // 2) Fallback: intentar cargar menu.json (requiere http/https)
  try {
    const resp = await fetch('menu.json', { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    menu = await resp.json();
    return menu;
  } catch (e) {
    console.warn('No se pudo cargar menu.json, usando fallback vacío', e);
    menu = { pizzas: [], tartas: [], pastas: [], minutas: [], bebidas: [] };
    return menu;
  }
}


const EMP_RULE_MAX_UNIT = 12;

const EMPANADAS = {
  comunes: {
    label: "comunes",
    precios: { unit: 1700, half: 10500, dozen: 20000 },
    sabores: ["Carne", "Pollo", "Jamón y Muzzarella"]
  },
  especiales: {
    label: "especiales",
    precios: { unit: 1900, half: 11000, dozen: 22000 },
    sabores: ["Verdura y Muzzarella", "Choclo y Muzzarella", "Roquefort y Jamón", "Capresse", "Calabresa"]
  }
};

// ================= STATE =================
const carrito = {}; // key -> {tipo, nombre, detalle?, cantidad, precio}
const qtyEls = new Map(); // productoKey -> spanElement
const addonEls = new Map(); // productoKey -> checkboxElement
const milEls = new Map(); // milanesa baseKey -> checkboxElement

let empState = null; // {tipo, pack, selected: Map, total, price}
let addressState = { status: "idle", formatted: null, placeId: null };

// ================= STORAGE (localStorage) =================
const CART_STORAGE_KEY = 'ldvg_cart_v1';

function saveCartToStorage() {
  try {
    // Guardamos un snapshot completo del carrito
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(carrito));
  } catch (e) {
    // ignore
  }
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return;

    // limpiar y rehidratar
    Object.keys(carrito).forEach((k) => delete carrito[k]);

    for (const [k, v] of Object.entries(obj)) {
      if (!v || typeof v !== 'object') continue;

      // Normalización mínima de campos básicos
      const cantidad = Number(v.cantidad || 0);
      const precio = Number(v.precio || 0);
      if (!cantidad || cantidad <= 0) continue;

      carrito[k] = { ...v, cantidad, precio };
    }
  } catch (e) {
    // ignore
  }
}

function syncAllQtyFromCart() {
  for (const baseKey of qtyEls.keys()) {
    actualizarQty(baseKey);
  }
}


// ================= HELPERS =================
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copiarAlias() {
  const el = document.getElementById('alias-text');
  const txt = (el ? el.textContent : 'cabala.sana.sabe.mp').trim();

  const showOk = () => {
    const msg = document.getElementById('alias-copiado');
    if (!msg) return;
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 1600);
  };

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(txt);
      showOk();
      return;
    }
  } catch (e) {
    // fallback abajo
  }

  // Fallback compatible (Android/Windows) usando textarea + execCommand
  const ta = document.createElement('textarea');
  ta.value = txt;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.left = '-1000px';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, ta.value.length);

  try {
    document.execCommand('copy');
    showOk();
  } catch (e) {
    alert('No se pudo copiar automáticamente. Alias: ' + txt);
  } finally {
    document.body.removeChild(ta);
  }
}

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("es-AR");
}

function unitPrice(it) {
  if (!it) return 0;
  // Soporta items con addon (precio base + adicional por unidad)
  if (it.precioBase != null) {
    const add = it.addonOn ? Number(it.addonPrice || 0) : 0;
    return Number(it.precioBase) + add;
  }
  return Number(it.precio || 0);
}

function keyProducto(cat, nombre, precio) {
  // Incluye precio para evitar colisiones (ej: Coca Cola 2.25L vs 1.75L)
  return `PROD::${cat}::${nombre}::${Number(precio || 0)}`;
}

function keyEmpanadas() {
  return `EMP::${Date.now()}::${Math.random().toString(16).slice(2)}`;
}

function empKey(s) {
  // clave segura (sin espacios/acentos) para data-attributes
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
// ================= RENDER PRODUCTOS (no empanadas) =================
function renderProductos(idCategoria, productos) {
  const cont = document.getElementById(idCategoria);
  if (!cont) return;
  cont.innerHTML = "";

  (productos || []).forEach((p) => {
    const precioNum = Number(p?.precio || 0);
    const k = keyProducto(idCategoria, p?.nombre || "", precioNum);
    const domKey = empKey(k);

    const row = document.createElement("div");
    row.className = "producto";
    row.dataset.key = k;
    row.dataset.nombre = String(p?.nombre || "");
    row.dataset.precio = String(precioNum);
    row.dataset.categoria = String(idCategoria || "");

    if (p?.config?.type) row.dataset.configType = String(p.config.type);

    if (p?.addon?.label && p?.addon?.price != null) {
      row.dataset.addonLabel = String(p.addon.label);
      row.dataset.addonPrice = String(Number(p.addon.price || 0));
    }

    // búsqueda (nombre + desc + categoría)
    const searchText = `${p?.nombre || ""} ${p?.descripcion || ""} ${idCategoria || ""}`;
    row.dataset.search = searchText;

    const desc = p?.descripcion ? `<div class="desc">${escapeHtml(p.descripcion)}</div>` : "";

    let precioHtml = `<div class="precio">$${fmtMoney(precioNum)}</div>`;
    if (p?.config?.type === 'pizza_mitad') {
      precioHtml = `<div class="precio muted">Precio según mitades</div>`;
    }

    let addonHtml = "";
    let controlsHtml = "";

    if (p?.config?.type === "milanesa") {
      const dom = empKey(k);
      addonHtml = `
        <label class="addon">
          <input type="checkbox" id="mil-${dom}" data-role="mil-checkbox">
          Ensalada mixta (por defecto papas fritas)
        </label>
      `;

      controlsHtml = `
        <button class="qty-btn" type="button" data-action="mil-minus">-</button>
        <span class="qty" id="qty-${domKey}">0</span>
        <button class="qty-btn" type="button" data-action="mil-plus">+</button>
      `;
    } else if (p?.config?.type === "manaos") {
      controlsHtml = `
        <button class="emp-btn" type="button" data-action="manaos-open">Elegir sabor</button>
      `;
    } else if (p?.config?.type === 'pizza_mitad') {
      controlsHtml = `
        <button class="emp-btn" type="button" data-action="half-open">Elegir mitades</button>
      `;
    } else {
      if (p?.addon?.label && p?.addon?.price != null) {
        const dom = empKey(k);
        addonHtml = `
          <label class="addon">
            <input type="checkbox" id="addon-${dom}" data-role="addon-checkbox">
            ${escapeHtml(p.addon.label)} (+$${fmtMoney(p.addon.price)})
          </label>
        `;

        controlsHtml = `
          <button class="qty-btn" type="button" data-action="prod-minus">-</button>
          <span class="qty" id="qty-${domKey}">0</span>
          <button class="qty-btn" type="button" data-action="prod-plus">+</button>
        `;
      } else {
        controlsHtml = `
          <button class="qty-btn" type="button" data-action="prod-minus">-</button>
          <span class="qty" id="qty-${domKey}">0</span>
          <button class="qty-btn" type="button" data-action="prod-plus">+</button>
        `;
      }
    }

    row.innerHTML = `
      <div class="producto-info">
        <strong>${escapeHtml(p?.nombre || "")}</strong>
        ${desc}
        ${precioHtml}
        ${addonHtml}
      </div>
      <div class="controls">${controlsHtml}</div>
    `;

    cont.appendChild(row);

    // qty
    const qtyEl = row.querySelector(`#qty-${CSS.escape(domKey)}`);
    if (qtyEl) qtyEls.set(k, qtyEl);

    // addon checkbox
    if (p?.addon?.label && p?.addon?.price != null) {
      const dom = empKey(k);
      const cb = row.querySelector(`#addon-${CSS.escape(dom)}`);
      if (cb) addonEls.set(k, cb);
    }

    // milanesa checkbox
    if (p?.config?.type === "milanesa") {
      const dom = empKey(k);
      const cb = row.querySelector(`#mil-${CSS.escape(dom)}`);
      if (cb) milEls.set(k, cb);
    }
  });
}

function sumarProducto(key, precio, nombreVisible) {
  if (!carrito[key]) {
    carrito[key] = { tipo: "producto", nombre: nombreVisible, cantidad: 0, precio };
  }
  carrito[key].cantidad++;
  actualizarCarrito();
  actualizarQty(key);
}

function sumarProductoConAddon(baseKey, precioBase, nombreVisible, addonLabel, addonPrice) {
  const cb = addonEls.get(baseKey) || null;
  const addonOn = cb ? !!cb.checked : false;

  const variantKey = addonOn ? `${baseKey}::ADDON` : `${baseKey}::BASE`;
  const precio = Number(precioBase) + (addonOn ? Number(addonPrice || 0) : 0);
  const detalle = addonOn ? String(addonLabel || "") : "";

  if (!carrito[variantKey]) {
    carrito[variantKey] = {
      tipo: "producto",
      nombre: nombreVisible,
      detalle,
      cantidad: 0,
      precio
    };
  }

  // mantener actualizado por si cambian valores
  carrito[variantKey].nombre = nombreVisible;
  carrito[variantKey].precio = precio;
  carrito[variantKey].detalle = detalle;

  carrito[variantKey].cantidad++;
  actualizarCarrito();
  actualizarQty(baseKey);
}

function milVariantKey(baseKey, ensalada) {
  return ensalada ? `${baseKey}::ENSALADA` : `${baseKey}::FRITAS`;
}

function sumarMilanesa(baseKey, precioUnit, nombreVisible) {
  const cb = milEls.get(baseKey) || null;
  const ensalada = cb ? !!cb.checked : false;
  const variantKey = milVariantKey(baseKey, ensalada);
  const detalle = ensalada ? 'Ensalada mixta' : 'Papas fritas';

  if (!carrito[variantKey]) {
    carrito[variantKey] = {
      tipo: 'milanesa',
      nombre: nombreVisible,
      detalle,
      cantidad: 0,
      precio: Number(precioUnit)
    };
  }

  carrito[variantKey].cantidad++;
  actualizarCarrito();
  actualizarQty(baseKey);
}

function restarMilanesa(baseKey) {
  const cb = milEls.get(baseKey) || null;
  const preferEnsalada = cb ? !!cb.checked : false;
  const kEns = milVariantKey(baseKey, true);
  const kFri = milVariantKey(baseKey, false);

  const first = preferEnsalada ? kEns : kFri;
  const second = preferEnsalada ? kFri : kEns;

  if (carrito[first]) {
    carrito[first].cantidad--;
    if (carrito[first].cantidad <= 0) delete carrito[first];
  } else if (carrito[second]) {
    carrito[second].cantidad--;
    if (carrito[second].cantidad <= 0) delete carrito[second];
  } else {
    actualizarQty(baseKey);
    return;
  }

  actualizarCarrito();
  actualizarQty(baseKey);
}

function toggleMilanesaGuarnicion(baseKey) {
  // El check solo afecta próximas unidades (no cambia las ya agregadas)
  actualizarQty(baseKey);
}


function toggleAddon(baseKey, checked) {
  // El check solo afecta próximas porciones (no modifica porciones ya agregadas)
}


// Milanesa: flujo inline (checkbox + +/-)

let manState = null; // {precioUnit}

function abrirManaos(precioUnit) {
  manState = { precioUnit: Number(precioUnit) };
  const modal = document.getElementById("man-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function cerrarManaos() {
  const modal = document.getElementById("man-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  manState = null;
}

function confirmarManaos(sabor) {
  if (!manState) return;
  const key = `CFG::MAN::${Date.now()}::${Math.random().toString(16).slice(2)}`;
  carrito[key] = {
    tipo: "bebida",
    nombre: "Manaos 2.25L",
    detalle: sabor,
    cantidad: 1,
    precio: manState.precioUnit
  };
  actualizarCarrito();
  cerrarManaos();
}







function restarItem(baseKey) {
  // Si tiene addon checkbox, restamos de la variante según el check
  const cb = addonEls.get(baseKey) || null;
  if (cb) {
    const preferAddon = !!cb.checked;
    const keyAddon = `${baseKey}::ADDON`;
    const keyBase = `${baseKey}::BASE`;
    const first = preferAddon ? keyAddon : keyBase;
    const second = preferAddon ? keyBase : keyAddon;

    if (carrito[first]) {
      carrito[first].cantidad--;
      if (carrito[first].cantidad <= 0) delete carrito[first];
    } else if (carrito[second]) {
      carrito[second].cantidad--;
      if (carrito[second].cantidad <= 0) delete carrito[second];
    } else {
      actualizarQty(baseKey);
      return;
    }

    actualizarCarrito();
    actualizarQty(baseKey);
    return;
  }

  // Producto normal
  if (!carrito[baseKey]) {
    actualizarQty(baseKey);
    return;
  }

  carrito[baseKey].cantidad--;
  if (carrito[baseKey].cantidad <= 0) delete carrito[baseKey];

  actualizarCarrito();
  actualizarQty(baseKey);
}


function eliminarLinea(key) {
  if (carrito[key]) delete carrito[key];
  actualizarCarrito();

  // Actualizar contador del producto base si corresponde
  let baseKey = key;
  if (typeof key === 'string') {
    baseKey = key
      .replace(/::(BASE|ADDON)$/,'')
      .replace(/::(FRITAS|ENSALADA)$/,'');
  }

  if (qtyEls.has(baseKey)) {
    actualizarQty(baseKey);
  }
}

function vaciarCarrito() {
  // borrar todas las líneas
  Object.keys(carrito).forEach((k) => delete carrito[k]);

  // resetear contadores visibles
  qtyEls.forEach((el) => {
    if (el) el.textContent = '0';
  });

  actualizarCarrito();
}

function actualizarQty(baseKey) {
  const el = qtyEls.get(baseKey) || null;
  let cant = 0;

  // Productos con addon (BASE/ADDON)
  if (addonEls.get(baseKey)) {
    const k1 = `${baseKey}::BASE`;
    const k2 = `${baseKey}::ADDON`;
    cant = (carrito[k1]?.cantidad || 0) + (carrito[k2]?.cantidad || 0);
  }
  // Milanesa (FRITAS/ENSALADA)
  else if (milEls.get(baseKey)) {
    const k1 = `${baseKey}::FRITAS`;
    const k2 = `${baseKey}::ENSALADA`;
    cant = (carrito[k1]?.cantidad || 0) + (carrito[k2]?.cantidad || 0);
  }
  // Producto normal
  else {
    cant = carrito[baseKey]?.cantidad ?? 0;
  }

  if (el) el.textContent = String(cant);
}



// (actualizarCarrito reemplazada por versión unificada)

function actualizarCarrito() {
  const items = document.getElementById("items-carrito");
  if (!items) return;

  items.innerHTML = "";
  let total = 0;

  Object.keys(carrito).forEach((key) => {
    const it = carrito[key];
    const u = Number(it?.precio || 0);
    const subtotal = Number(it?.cantidad || 0) * u;
    total += subtotal;

    const row = document.createElement("div");
    row.className = "cart-row";

    const detalle = it?.detalle ? `<div class="cart-detail">${escapeHtml(it.detalle)}</div>` : "";
    const keyEnc = encodeURIComponent(key);

    row.innerHTML = `
      <div class="cart-left">
        <div class="cart-title">${escapeHtml(it?.nombre || "(sin nombre)")}</div>
        ${detalle}
        <div class="cart-sub">${it?.cantidad || 0} x $${fmtMoney(u)} = <strong>$${fmtMoney(subtotal)}</strong></div>
      </div>
      <div class="cart-right">
        <button class="trash" type="button" title="Eliminar" data-action="cart-remove" data-key="${keyEnc}">✕</button>
      </div>
    `;

    items.appendChild(row);
  });

  const totalEl = document.getElementById("total");
  if (totalEl) totalEl.innerText = fmtMoney(total);

  // persistencia
  saveCartToStorage();
}


// ================= PIZZA MITAD Y MITAD =================
let halfState = { a: null, b: null }; // nombre de pizza

function pizzasBaseParaMitades() {
  // pizzas reales (excluye el item especial pizza_mitad)
  const list = (menu?.pizzas || []).filter(p => !(p?.config?.type === 'pizza_mitad'));
  return list;
}

function abrirPizzaMitadMitad() {
  const modal = document.getElementById('half-modal');
  if (!modal) return;

  const sel1 = document.getElementById('half-1');
  const sel2 = document.getElementById('half-2');
  if (!sel1 || !sel2) return;

  const pizzas = pizzasBaseParaMitades();

  const buildOptions = () => {
    const opts = ['<option value="">-- Elegir --</option>'];
    pizzas.forEach(p => {
      const nombre = String(p.nombre || '');
      const precio = Number(p.precio || 0);
      const half = precio / 2;
      opts.push(`<option value="${encodeURIComponent(nombre)}">${escapeHtml(nombre)} (½ $${fmtMoney(half)})</option>`);
    });
    return opts.join('');
  };

  const htmlOpts = buildOptions();
  sel1.innerHTML = htmlOpts;
  sel2.innerHTML = htmlOpts;

  // reset state
  halfState = { a: '', b: '' };
  sel1.value = '';
  sel2.value = '';

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  syncPizzaMitadMitadUI();
}

function cerrarPizzaMitadMitad() {
  const modal = document.getElementById('half-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function limpiarPizzaMitadMitad() {
  const sel1 = document.getElementById('half-1');
  const sel2 = document.getElementById('half-2');
  if (sel1) sel1.value = '';
  if (sel2) sel2.value = '';
  halfState = { a: '', b: '' };
  syncPizzaMitadMitadUI();
}

function findPizzaByName(nombre) {
  const pizzas = pizzasBaseParaMitades();
  return pizzas.find(p => String(p.nombre || '') === String(nombre || '')) || null;
}

function calcHalfPrice(nombre) {
  const p = findPizzaByName(nombre);
  const full = Number(p?.precio || 0);
  return full / 2;
}

function syncPizzaMitadMitadUI() {
  const sel1 = document.getElementById('half-1');
  const sel2 = document.getElementById('half-2');
  const priceEl = document.getElementById('half-price');
  if (!sel1 || !sel2 || !priceEl) return;

  const a = decodeURIComponent(sel1.value || '');
  const b = decodeURIComponent(sel2.value || '');

  // Si quedaron iguales, limpiamos la mitad 2 (regla: no duplicar)
  if (a && b && a === b) {
    sel2.value = '';
  }

  const a2 = decodeURIComponent(sel1.value || '');
  const b2 = decodeURIComponent(sel2.value || '');
  halfState = { a: a2, b: b2 };

  // Deshabilitar en cada select la opción seleccionada en el otro
  const disableOption = (selectEl, nombreToDisable) => {
    const encoded = encodeURIComponent(nombreToDisable || '');
    for (const opt of Array.from(selectEl.options)) {
      if (!opt.value) { opt.disabled = false; continue; }
      opt.disabled = (nombreToDisable && opt.value === encoded);
    }
  };

  disableOption(sel1, b2);
  disableOption(sel2, a2);

  const total = (a2 ? calcHalfPrice(a2) : 0) + (b2 ? calcHalfPrice(b2) : 0);
  priceEl.textContent = fmtMoney(total);
}

function confirmarPizzaMitadMitad() {
  const a = halfState.a;
  const b = halfState.b;

  if (!a || !b) {
    alert('Elegí las 2 mitades.');
    return;
  }

  const pa = calcHalfPrice(a);
  const pb = calcHalfPrice(b);
  const total = pa + pb;

  const key = `PIZZA_HALF::${Date.now()}::${Math.random().toString(16).slice(2)}`;
  carrito[key] = {
    tipo: 'pizza_mitad',
    nombre: 'Pizza Mitad y Mitad',
    detalle: `Mitad 1: ${a} (½ $${fmtMoney(pa)})\nMitad 2: ${b} (½ $${fmtMoney(pb)})`,
    cantidad: 1,
    precio: total,
    halves: { a, b, pa, pb }
  };

  actualizarCarrito();
  cerrarPizzaMitadMitad();
}

// ================= EMPANADAS (modal + packs) =================
function abrirEmpanadas(tipo, pack) {
  const def = EMPANADAS[tipo];
  if (!def) return;

  // Regla: modo unidad permite seleccionar 1..12 empanadas (se valida en el modal y al confirmar)
  empState = {
    tipo,
    pack, // 1, 6, 12
    selected: new Map(), // sabor -> cantidad
  };

  // Si es selección por unidad, permitimos hasta 12 en el mismo modal
  if (pack === 1) {
    empState.isUnitMode = true;
    empState.pack = EMP_RULE_MAX_UNIT;
    pack = EMP_RULE_MAX_UNIT;
  }

  // UI
  const modal = document.getElementById("emp-modal");
  if (!modal) return;

  document.getElementById("emp-modal-title").textContent = `Empanadas ${def.label}`;
  document.getElementById("emp-modal-subtitle").textContent = empState.isUnitMode ? `Elegí los gustos (1 a ${EMP_RULE_MAX_UNIT} unidades).` : `Elegí los gustos para ${pack === 6 ? "½ docena" : "docena"}.`;

  const list = document.getElementById("emp-modal-list");
  list.innerHTML = "";

  def.sabores.forEach((sabor) => {
    const row = document.createElement("div");
    row.className = "emp-row";
    row.innerHTML = `
      <div class="emp-row-left">
        <div class="emp-sabor">${escapeHtml(sabor)}</div>
      </div>
      <div class="emp-row-right">
        <button class="qty-btn" type="button" data-action="emp-sabor-minus" data-sabor="${encodeURIComponent(sabor)}">-</button>
        <span class="qty" data-emp-key="${empKey(sabor)}">0</span>
        <button class="qty-btn" type="button" data-action="emp-sabor-plus" data-sabor="${encodeURIComponent(sabor)}">+</button>
      </div>
    `;
    list.appendChild(row);
  });

  document.getElementById("emp-max").textContent = String(pack);

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  empSyncUI();
}

function cerrarEmpanadas() {
  const modal = document.getElementById("emp-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  empState = null;
}

function limpiarEmpanadas() {
  if (!empState) return;
  empState.selected.clear();
  empSyncUI();
}

function empSumar(sabor) {
  if (!empState) return;
  const max = empState.pack;
  const totalSel = empTotalSeleccionadas();

  if (empState.isUnitMode) {
    const ya = contarEmpanadasUnitEnCarrito();
    if (ya + totalSel >= EMP_RULE_MAX_UNIT) {
      alert(`Máximo ${EMP_RULE_MAX_UNIT} empanadas por unidad.`);
      return;
    }
  }
  if (totalSel >= max) return;

  empState.selected.set(sabor, (empState.selected.get(sabor) || 0) + 1);
  empSyncUI();
}

function empRestar(sabor) {
  if (!empState) return;
  const cur = empState.selected.get(sabor) || 0;
  if (cur <= 0) return;
  if (cur === 1) empState.selected.delete(sabor);
  else empState.selected.set(sabor, cur - 1);
  empSyncUI();
}

function empTotalSeleccionadas() {
  if (!empState) return 0;
  let t = 0;
  empState.selected.forEach((v) => (t += v));
  return t;
}

function empPrecioUnit() {
  const def = EMPANADAS[empState.tipo];
  return Number(def?.precios?.unit || 0);
}


function empSyncUI() {
  if (!empState) return;
  const totalSel = empTotalSeleccionadas();
  document.getElementById("emp-count").textContent = String(totalSel);
  const unit = empPrecioUnit();
  let price = unit * totalSel;
  if (!empState.isUnitMode) {
    // packs
    const def = EMPANADAS[empState.tipo];
    price = (empState.pack === 6 ? def.precios.half : def.precios.dozen);
  }
  document.getElementById("emp-price").textContent = fmtMoney(price);

  // actualizar contadores por sabor
  empState.selected.forEach((qty, sabor) => {
    const el = document.querySelector(`[data-emp-key="${empKey(sabor)}"]`);
    if (el) el.textContent = String(qty);
  });
  // poner en 0 los no seleccionados
  const def = EMPANADAS[empState.tipo];
  def.sabores.forEach((sabor) => {
    if (!empState.selected.has(sabor)) {
      const el = document.querySelector(`[data-emp-key="${empKey(sabor)}"]`);
      if (el) el.textContent = "0";
    }
  });
}

function confirmarEmpanadas() {
  if (!empState) return;

  const totalSel = empTotalSeleccionadas();

  // Validación
  if (empState.isUnitMode) {
    const ya = contarEmpanadasUnitEnCarrito();
    if (totalSel < 1 || totalSel > EMP_RULE_MAX_UNIT) {
      alert(`Seleccioná entre 1 y ${EMP_RULE_MAX_UNIT} empanada(s).`);
      return;
    }
    if (ya + totalSel >= EMP_RULE_MAX_UNIT) {
      alert(`Máximo ${EMP_RULE_MAX_UNIT} empanadas por unidad.`);
      return;
    }
  } else {
    if (totalSel !== empState.pack) {
      alert(`Tenés que seleccionar exactamente ${empState.pack} empanada(s).`);
      return;
    }
  }

  const def = EMPANADAS[empState.tipo];

  const detalle = [...empState.selected.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([s, q]) => `${q}x ${s}`)
    .join(", ");

  const labelPack = empState.isUnitMode
    ? "Unidad"
    : (empState.pack === 6 ? "½ Docena" : "Docena");

  const nombreLinea = `Empanadas ${def.label} (${labelPack})`;

  // Cada selección es una línea independiente (clave única)
  const key = keyEmpanadas();
  const cantidadLinea = empState.isUnitMode ? totalSel : 1;
  const precioLinea = empState.isUnitMode
    ? empPrecioUnit()
    : (empState.pack === 6 ? def.precios.half : def.precios.dozen);

  carrito[key] = {
    tipo: "empanadas",
    pack: empState.isUnitMode ? 1 : empState.pack,
    nombre: nombreLinea,
    detalle,
    cantidad: cantidadLinea,
    precio: precioLinea
  };

  actualizarCarrito();
  cerrarEmpanadas();
}

function contarEmpanadasUnitEnCarrito() {
  let c = 0;
  Object.values(carrito).forEach((it) => {
    if (it?.tipo === "empanadas" && typeof it.nombre === 'string' && it.nombre.includes("Unidad")) {
      c += Number(it.cantidad || 0);
    }
  });
  return c;
}

// ================= BUSCADOR POR SECCIONES =================
function aplicarFiltro(filtroRaw) {
  const filtro = (filtroRaw || "").trim().toLowerCase();
  const sections = document.querySelectorAll(".menu-section");

  // Productos renderizados (excluye empanadas que es sección especial)
  const prods = document.querySelectorAll(".producto");

  if (!filtro) {
    prods.forEach((p) => (p.style.display = "flex"));
    sections.forEach((s) => (s.style.display = "block"));
    return;
  }

  // Filtrar productos usando dataset.search (nombre+desc+categ)
  prods.forEach((prod) => {
    const text = (prod.dataset.search || prod.innerText || "").toLowerCase();
    prod.style.display = text.includes(filtro) ? "flex" : "none";
  });

  // Ocultar secciones sin resultados
  sections.forEach((section) => {
    const sec = section.dataset.section;

    if (sec === "empanadas") {
      // sección especial (no tiene .producto dentro)
      const showEmp = filtro.includes("emp") || filtro.includes("empan") || filtro.includes("🥟");
      section.style.display = showEmp ? "block" : "none";
      return;
    }

    const visibles = section.querySelectorAll('.producto:not([style*="display: none"])');
    section.style.display = visibles.length > 0 ? "block" : "none";
  });
}

// ================= INIT =================

function bindUI() {
  // Clicks
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    const action = el.dataset.action;

    // acciones de modales/backdrops
    if (action === 'emp-close') return cerrarEmpanadas();
    if (action === 'manaos-close') return cerrarManaos();

    // acciones con filas de producto
    const prodRow = el.closest('.producto');
    const baseKey = prodRow?.dataset?.key || null;

    switch (action) {
      case 'prod-plus': {
        if (!prodRow || !baseKey) return;
        const precio = Number(prodRow.dataset.precio || 0);
        const nombre = String(prodRow.dataset.nombre || '');
        const addonLabel = prodRow.dataset.addonLabel;
        const addonPrice = prodRow.dataset.addonPrice;
        if (addonLabel && addonPrice != null) {
          return sumarProductoConAddon(baseKey, precio, nombre, addonLabel, Number(addonPrice || 0));
        }
        return sumarProducto(baseKey, precio, nombre);
      }
      case 'prod-minus': {
        if (!baseKey) return;
        return restarItem(baseKey);
      }
      case 'mil-plus': {
        if (!prodRow || !baseKey) return;
        const precio = Number(prodRow.dataset.precio || 0);
        const nombre = String(prodRow.dataset.nombre || '');
        return sumarMilanesa(baseKey, precio, nombre);
      }
      case 'mil-minus': {
        if (!baseKey) return;
        return restarMilanesa(baseKey);
      }
      case 'manaos-open': {
        if (!prodRow) return;
        const precio = Number(prodRow.dataset.precio || 0);
        return abrirManaos(precio);
      }
      case 'half-open': {
        if (!prodRow) return;
        return abrirPizzaMitadMitad();
      }

      // carrito
      case 'cart-remove': {
        const kEnc = el.dataset.key || '';
        const k = decodeURIComponent(kEnc);
        return eliminarLinea(k);
      }
      case 'vaciar-carrito':
        return vaciarCarrito();
      case 'copy-alias':
        return copiarAlias();
      case 'send-wa':
        return enviarWhatsApp();

      // empanadas
      case 'emp-open': {
        const tipo = el.dataset.tipo;
        const pack = Number(el.dataset.pack || 0);
        return abrirEmpanadas(tipo, pack);
      }
      case 'emp-clear':
        return limpiarEmpanadas();
      case 'emp-confirm':
        return confirmarEmpanadas();

      // empanadas (botones por sabor)
      case 'emp-sabor-plus': {
        const sEnc = el.dataset.sabor || '';
        const sabor = decodeURIComponent(sEnc);
        return empSumar(sabor);
      }
      case 'emp-sabor-minus': {
        const sEnc = el.dataset.sabor || '';
        const sabor = decodeURIComponent(sEnc);
        return empRestar(sabor);
      }

      // pizza mitad y mitad
      case 'half-close':
        return cerrarPizzaMitadMitad();
      case 'half-clear':
        return limpiarPizzaMitadMitad();
      case 'half-confirm':
        return confirmarPizzaMitadMitad();
      // manaos modal
      case 'manaos-confirm': {
        const sabor = el.dataset.sabor || '';
        return confirmarManaos(sabor);
      }

      default:
        return;
    }
  });

  // Changes (checkboxes)
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLSelectElement)) return;

    // selects de pizza mitad y mitad
    if (t instanceof HTMLSelectElement && t.classList.contains('half-select')) {
      return syncPizzaMitadMitadUI();
    }


    if (t.dataset.role === 'addon-checkbox') {
      const row = t.closest('.producto');
      const baseKey = row?.dataset?.key || null;
      if (baseKey) toggleAddon(baseKey, t.checked);
      return;
    }

    if (t.dataset.role === 'mil-checkbox') {
      const row = t.closest('.producto');
      const baseKey = row?.dataset?.key || null;
      if (baseKey) toggleMilanesaGuarnicion(baseKey);
      return;
    }
  });
}

async function init() {
  await loadMenu();
  bindUI();

  // render
  renderProductos("pizzas", menu.pizzas);
  renderProductos("tartas", menu.tartas);
  renderProductos("pastas", menu.pastas);
  renderProductos("minutas", menu.minutas);
  renderProductos("bebidas", menu.bebidas);

  loadCartFromStorage();
  actualizarCarrito();
  syncAllQtyFromCart();

  // buscador
  const buscador = document.getElementById("buscador");
  if (buscador) {
    buscador.addEventListener("input", function () {
      aplicarFiltro(this.value);
    });
  }

  // validación dirección
  const dir = document.getElementById("direccion");
  if (dir) {
    dir.addEventListener("blur", () => validarDireccionGoogle(dir.value));
  }

  // aviso transferencia
  const warn = document.getElementById('transferencia-warning');
  const radios = document.querySelectorAll("input[name='pago']");
  const syncWarn = () => {
    const sel = document.querySelector("input[name='pago']:checked");
    if (!warn) return;
    warn.style.display = (sel && sel.value === 'Transferencia') ? 'block' : 'none';
  };
  radios.forEach(r => r.addEventListener('change', syncWarn));
  syncWarn();
}

document.addEventListener("DOMContentLoaded", init);
// ================= VALIDACIÓN DIRECCIÓN (Google Geocoding) =================
async function validarDireccionGoogle(direccion) {
  const statusEl = document.getElementById("direccion-status");
  const val = (direccion || "").trim();

  if (!statusEl) return;

  if (!val) {
    addressState = { status: "idle", formatted: null, placeId: null };
    statusEl.textContent = "";
    return;
  }

  if (!CONFIG.googleMapsApiKey) {
    // Sin key: no bloquear, sólo avisar
    addressState = { status: "no_key", formatted: null, placeId: null };
    statusEl.textContent = "(Dirección sin validar: falta API key de Google Maps)";
    return;
  }

  try {
    addressState = { status: "validating", formatted: null, placeId: null };
    statusEl.textContent = "Validando dirección...";

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", val);
    url.searchParams.set("region", CONFIG.googleGeocodeRegion);
    url.searchParams.set("key", CONFIG.googleMapsApiKey);

    const resp = await fetch(url.toString());
    const data = await resp.json();

    if (data.status !== "OK" || !data.results || data.results.length === 0) {
      addressState = { status: "invalid", formatted: null, placeId: null };
      statusEl.textContent = "Dirección no encontrada. Revisá calle y altura.";
      return;
    }

    const best = data.results[0];
    addressState = { status: "ok", formatted: best.formatted_address, placeId: best.place_id };
    statusEl.textContent = `Dirección validada: ${best.formatted_address}`;
  } catch (e) {
    addressState = { status: "error", formatted: null, placeId: null };
    statusEl.textContent = "No se pudo validar la dirección (error de red).";
  }
}
// ================= WHATSAPP =================
async function enviarWhatsApp() {
  const nombre = document.getElementById("nombre")?.value?.trim() || "";
  const direccion = document.getElementById("direccion")?.value?.trim() || "";
  const pago = document.querySelector("input[name='pago']:checked");

  if (!nombre) {
    alert("Ingrese nombre");
    return;
  }

  if (!direccion) {
    alert("Ingrese dirección");
    return;
  }

  if (!pago) {
    alert("Seleccione forma de pago");
    return;
  }

  const claves = Object.keys(carrito);
  if (claves.length === 0) {
    alert("Tu carrito está vacío");
    return;
  }

  if (CONFIG.googleMapsApiKey) {
    await validarDireccionGoogle(direccion);
  }

  // Si hay API key y la dirección quedó inválida, bloqueamos
  if (CONFIG.googleMapsApiKey && addressState.status === "invalid") {
    alert("La dirección no pudo validarse. Revisá y volvé a intentar.");
    return;
  }

  let total = 0;
  let detalle = "";

  claves.forEach((k) => {
    const it = carrito[k];
    const sub = (Number(it?.cantidad || 0)) * (Number(it?.precio || 0));
    total += sub;

    const det = it?.detalle ? `
  ${it.detalle}` : "";
    detalle += `- ${it.cantidad} x ${it.nombre} ($${fmtMoney(sub)})${det}
`;
  });

  const dirLine = addressState.formatted ? addressState.formatted : direccion;

  const msg = `Hola! Soy ${nombre}.\nDirección: ${dirLine}.\nPago: ${pago.value}.\n\nPedido:\n${detalle}\nTotal: $${fmtMoney(total)}`;

  const url = `https://wa.me/${CONFIG.whatsappPhone}?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank");
}
