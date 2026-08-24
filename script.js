// ================= CONFIG =================
const CONFIG = {
  whatsappPhone: "5491123219676", // sin + ni espacios
  googleMapsApiKey: "", // <-- pegá tu API KEY acá
  googleGeocodeRegion: "AR"
};

// ================= DATA =================
const menu = {
  pizzas: [
    { nombre: "Muzzarella", precio: 10500, descripcion: "Abundante muzzarella" },
    { nombre: "Fugazza", precio: 15000, descripcion: "Muzzarella / cebolla cocida cortada en juliana" },
    { nombre: "Jamón Cocido", precio: 16500, descripcion: "Muzzarella / jamón" },
    { nombre: "Jamón y Morrones", precio: 18000, descripcion: "Muzzarella / jamón / morrones" },
    { nombre: "Napolitana", precio: 18000, descripcion: "Muzzarella / jamón / rodajas de tomate / albahaca" },
    { nombre: "Calabresa", precio: 17000, descripcion: "Muzzarella / longaniza / pimentón" },
    { nombre: "Roquefort", precio: 19000, descripcion: "Muzzarella / roquefort / tiritas de jamón" },
    { nombre: "Jamón Crudo y Rúcula", precio: 22000, descripcion: "Muzzarella / jamón crudo / rúcula" },
    { nombre: "Anchoas", precio: 21000, descripcion: "Muzzarella / anchoas" },
    { nombre: "Ananá", precio: 22000, descripcion: "Muzzarella / jamón / rodajas de ananá" }
  ],
  tartas: [
    { nombre: "Jamón", precio: 18000, descripcion: "Jamón & muzzarella" },
    { nombre: "Verdura", precio: 18000, descripcion: "Espinaca & muzzarella" },
    { nombre: "Cebolla", precio: 18000, descripcion: "Cebolla & muzzarella" }
  ],
  pastas: [
    { nombre: "Sorrentinos (Jamón & Muzzarella)", precio: 20000, descripcion: "Jamón & muzzarella" },
    { nombre: "Sorrentinos (Espinaca)", precio: 20000, descripcion: "Espinaca" },
    { nombre: "Ravioles (Espinaca)", precio: 19000, descripcion: "Espinaca" },
    { nombre: "Ravioles (Ricota)", precio: 19000, descripcion: "Ricota" },
    { nombre: "Fideos", precio: 18000, descripcion: "Con estofado de carne" },
    { nombre: "Ñoquis", precio: 18000, descripcion: "Con estofado de carne" }
  ],
  minutas: [
    { nombre: "Hamburguesa", precio: 14000, descripcion: "Hamburguesa Unión Ganadera 120 grs: jamón, queso, lechuga, tomate, huevo frito y papas fritas." },
    { nombre: "Milanesa Napolitana (Pollo)", precio: 19000, descripcion: "Elegí guarnición: fritas o ensalada mixta", config: { type: "milanesa", carne: "Pollo" } },
    { nombre: "Milanesa Napolitana (Ternera)", precio: 19000, descripcion: "Elegí guarnición: fritas o ensalada mixta", config: { type: "milanesa", carne: "Ternera" } },
    { nombre: "Papas Medianas", precio: 7000, descripcion: "Porción mediana", addon: { label: "Cheddar y verdeo", price: 3000 } },
    { nombre: "Papas Grandes", precio: 10000, descripcion: "Porción grande", addon: { label: "Cheddar y verdeo", price: 3000 } }
  ],
  bebidas: [
    { nombre: "Cerveza Lata", precio: 2800, descripcion: "473cc" },
    { nombre: "Coca Cola", precio: 5700, descripcion: "2.25L" },
    { nombre: "Coca Cola", precio: 5000, descripcion: "1.75L (sin azúcar)" },
    { nombre: "Manaos", precio: 2100, descripcion: "2.25L", config: { type: "manaos", options: ["Cola", "Lima-limón", "Pomelo"] } }
  ]
};

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

  productos.forEach((p) => {
    const k = keyProducto(idCategoria, p.nombre, p.precio);
    const kEnc = encodeURIComponent(k);
    const domKey = empKey(k);

    const row = document.createElement("div");
    row.className = "producto";
    row.dataset.key = k;

    const desc = p.descripcion ? `<div class="desc">${escapeHtml(p.descripcion)}</div>` : "";

    // Addon (solo para papas con cheddar)
    let addonHtml = "";
    let controlsHtml = "";

    if (p.config && p.config.type === "milanesa") {
      const dom = empKey(k);
      addonHtml = `
          <label class="addon">
            <input type="checkbox" id="mil-${dom}" onchange="toggleMilanesaGuarnicion(decodeURIComponent('${kEnc}'))">
            Ensalada mixta (por defecto papas fritas)
          </label>
        `;

      controlsHtml = `
          <button class="qty-btn" onclick="restarMilanesa(decodeURIComponent('${kEnc}'))">-</button>
          <span class="qty" id="qty-${domKey}">0</span>
          <button class="qty-btn" onclick="sumarMilanesa(decodeURIComponent('${kEnc}'), ${Number(p.precio)}, decodeURIComponent('${encodeURIComponent(p.nombre)}'))">+</button>
        `;
    } else if (p.config && p.config.type === "manaos") {
      controlsHtml = `
        <button class="emp-btn" onclick="abrirManaos(${Number(p.precio)})">Elegir sabor</button>
      `;
    } else {
      if (p.addon && p.addon.label && p.addon.price != null) {
        const dom = empKey(k);
        addonHtml = `
          <label class="addon">
            <input type="checkbox" id="addon-${dom}" onchange="toggleAddon(decodeURIComponent('${kEnc}'), this.checked)">
            ${escapeHtml(p.addon.label)} (+$${fmtMoney(p.addon.price)})
          </label>
        `;

        controlsHtml = `
          <button class="qty-btn" onclick="restarItem(decodeURIComponent('${kEnc}'))">-</button>
          <span class="qty" id="qty-${domKey}">0</span>
          <button class="qty-btn" onclick="sumarProductoConAddon(decodeURIComponent('${kEnc}'), ${Number(p.precio)}, decodeURIComponent('${encodeURIComponent(p.nombre)}'), decodeURIComponent('${encodeURIComponent(p.addon.label)}'), ${Number(p.addon.price)})">+</button>
        `;
      } else {
        controlsHtml = `
          <button class="qty-btn" onclick="restarItem(decodeURIComponent('${kEnc}'))">-</button>
          <span class="qty" id="qty-${domKey}">0</span>
          <button class="qty-btn" onclick="sumarProducto(decodeURIComponent('${kEnc}'), ${Number(p.precio)}, decodeURIComponent('${encodeURIComponent(p.nombre)}'))">+</button>
        `;
      }
    }

    row.innerHTML = `
      <div class="producto-info">
        <strong>${escapeHtml(p.nombre)}</strong>
        ${desc}
        <div class="precio">$${fmtMoney(p.precio)}</div>
        ${addonHtml}
      </div>
      <div class="controls">${controlsHtml}</div>
    `;

    cont.appendChild(row);

    // qty
    const qtyEl = row.querySelector(`#qty-${CSS.escape(domKey)}`);
    if (qtyEl) qtyEls.set(k, qtyEl);

    // addon checkbox
    if (p.addon && p.addon.label && p.addon.price != null) {
      const dom = empKey(k);
      const cb = row.querySelector(`#addon-${CSS.escape(dom)}`);
      if (cb) addonEls.set(k, cb);
    }

    // milanesa checkbox
    if (p.config && p.config.type === "milanesa") {
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

    const detalle = it.detalle ? `<div class="cart-detail">${escapeHtml(it.detalle)}</div>` : "";

    row.innerHTML = `
      <div class="cart-left">
        <div class="cart-title">${escapeHtml(it.nombre || "(sin nombre)")}</div>
        ${detalle}
        <div class="cart-sub">${it.cantidad} x $${fmtMoney(u)} = <strong>$${fmtMoney(subtotal)}</strong></div>
      </div>
      <div class="cart-right">
        <button class="trash" title="Eliminar" onclick="eliminarLinea('${escapeHtml(key)}')">✕</button>
      </div>
    `;

    items.appendChild(row);
  });

  const totalEl = document.getElementById("total");
  if (totalEl) totalEl.innerText = fmtMoney(total);
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
        <button class="qty-btn" onclick="empRestar('${escapeHtml(sabor)}')">-</button>
        <span class="qty" data-emp-key="${empKey(sabor)}">0</span>
        <button class="qty-btn" onclick="empSumar('${escapeHtml(sabor)}')">+</button>
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

  if (!filtro) {
    document.querySelectorAll(".producto").forEach((p) => (p.style.display = "flex"));
    sections.forEach((s) => (s.style.display = "block"));
    return;
  }

  // filtrar productos
  document.querySelectorAll(".producto").forEach((prod) => {
    const texto = prod.innerText.toLowerCase();
    prod.style.display = texto.includes(filtro) ? "flex" : "none";
  });

  // ocultar secciones sin resultados
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
function init() {
  // render
  renderProductos("pizzas", menu.pizzas);
  renderProductos("tartas", menu.tartas);
  renderProductos("pastas", menu.pastas);
  renderProductos("minutas", menu.minutas);
  renderProductos("bebidas", menu.bebidas);

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

  actualizarCarrito();
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
