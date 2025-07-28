// ===== CONFIGURAÇÕES =====
const CONFIG = {
  SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS6FsKfgWJxQBzkKSP3ekD-Tbb7bfvGs_Df9aUT9bkv8gPL8dySYVkMmFdlajdrgxLZUs3pufrc0ZX8/pub?gid=1353948690&single=true&output=csv',
  WHATSAPP_NUMBER: '554733483186',
  PROXIES: [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
  ],
  CACHE_DURATION: 3 * 60 * 1000, // 3 minutos
  CACHE_KEY: 'natuBrava_products_cache',
  ITEMS_PER_PAGE: 60,
  SCROLL_THRESHOLD: 300,
  LOW_STOCK_THRESHOLD: 100, // Gramas - estoque baixo para granel
  MIN_GRANEL_QUANTITY: 50 // Quantidade mínima para granel
};

// ===== FUNÇÕES DE CACHE OTIMIZADAS =====
function getCachedProducts() {
  try {
    const cached = localStorage.getItem(CONFIG.CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < CONFIG.CACHE_DURATION) {
        return data.products;
      }
    }
  } catch (error) {
    localStorage.removeItem(CONFIG.CACHE_KEY);
  }
  return null;
}

function setCachedProducts(products) {
  try {
    const cacheData = {
      products: products,
      timestamp: Date.now()
    };
    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Erro ao salvar cache de produtos:', error);
  }
}

// ===== FUNÇÕES DE PERSISTÊNCIA DO CARRINHO =====
function saveCartToLocalStorage() {
  try {
    const cartData = {
      items: cart,
      timestamp: Date.now(),
      version: '2.1'
    };
    localStorage.setItem('natuBravaCart', JSON.stringify(cartData));
  } catch (error) {
    console.error('Erro ao salvar carrinho:', error);
  }
}

function loadCartFromLocalStorage() {
  try {
    const savedData = localStorage.getItem('natuBravaCart');
    if (!savedData) return [];
    
    const cartData = JSON.parse(savedData);
    
    if (Array.isArray(cartData)) {
      return cartData;
    }
    
    if (cartData.items && Array.isArray(cartData.items)) {
      const daysSinceLastSave = (Date.now() - (cartData.timestamp || 0)) / (1000 * 60 * 60 * 24);
      if (daysSinceLastSave > 7) {
        localStorage.removeItem('natuBravaCart');
        return [];
      }
      return cartData.items;
    }
    
    return [];
  } catch (error) {
    localStorage.removeItem('natuBravaCart');
    return [];
  }
}

// ===== FETCH OTIMIZADO COM PROXIES =====
async function fetchWithProxy(url) {
  const errors = [];
  
  for (const proxy of CONFIG.PROXIES) {
    try {
      const response = await fetch(proxy + encodeURIComponent(url), {
        headers: {
          'Accept': 'text/csv,text/plain,*/*'
        }
      });
      
      if (response.ok) {
        return response;
      }
      
      errors.push(`Proxy ${proxy}: Status ${response.status}`);
    } catch (error) {
      errors.push(`Proxy ${proxy}: ${error.message}`);
      continue;
    }
  }
  
  throw new Error(`Todos os proxies falharam: ${errors.join(', ')}`);
}

// ===== ESTADO GLOBAL =====
let products = [];
let filteredProducts = [];
let cart = [];
let currentFilter = 'Todos';
let currentPage = 1;
let totalPages = 1;
let isLoading = false;
let searchTimeout;

// ===== ELEMENTOS DOM (CACHE) =====
const elements = {
  loadingStatus: document.getElementById('loading-status'),
  produtosSection: document.getElementById('produtos'),
  errorSection: document.getElementById('error-section'),
  errorDetails: document.getElementById('error-details'),
  retryButton: document.getElementById('retry-button'),
  productList: document.getElementById('product-list'),
  categoryFilters: document.getElementById('category-filters'),
  noProductsMessage: document.getElementById('no-products-message'),
  cartButton: document.getElementById('cart-button'),
  cartButtonMobile: document.getElementById('cart-button-mobile'),
  closeCartButton: document.getElementById('close-cart-button'),
  cartPanel: document.getElementById('cart-panel'),
  cartOverlay: document.getElementById('cart-overlay'),
  cartItems: document.getElementById('cart-items'),
  cartCount: document.getElementById('cart-count'),
  cartCountMobile: document.getElementById('cart-count-mobile'),
  cartTotal: document.getElementById('cart-total'),
  checkoutButton: document.getElementById('checkout-button'),
  cartEmptyMessage: document.getElementById('cart-empty-message'),
  currentYear: document.getElementById('current-year'),
  searchBox: document.getElementById('search-box'),
  nameModalOverlay: document.getElementById('name-modal-overlay'),
  nameModal: document.getElementById('name-modal'),
  clientNameInput: document.getElementById('client-name'),
  clientObservation: document.getElementById('client-observation'),
  nameError: document.getElementById('name-error'),
  confirmCheckoutButton: document.getElementById('confirm-checkout-button'),
  cancelCheckoutButton: document.getElementById('cancel-checkout-button'),
  deliveryInfoButton: document.getElementById('delivery-info-button'),
  deliveryModalOverlay: document.getElementById('delivery-modal-overlay'),
  closeDeliveryModalButton: document.getElementById('close-delivery-modal-button'),
  okDeliveryModalButton: document.getElementById('ok-delivery-modal-button'),
  clubInfoButton: document.getElementById('club-info-button'),
  clubInfoModalOverlay: document.getElementById('club-info-modal-overlay'),
  closeClubModalButton: document.getElementById('close-club-modal-button'),
  mobileMenuButton: document.getElementById('mobile-menu-button'),
  mobileMenu: document.getElementById('mobile-menu'),
  clubInfoButtonMobile: document.getElementById('club-info-button-mobile'),
  deliveryInfoButtonMobile: document.getElementById('delivery-info-button-mobile'),
  pagination: document.getElementById('pagination'),
  productCounter: document.getElementById('product-counter'),
  backToTop: document.getElementById('back-to-top'),
  searchResults: document.getElementById('search-results'),
  notifyModalOverlay: document.getElementById('notify-modal-overlay'),
  notifyModal: document.getElementById('notify-modal'),
  clientNotifyName: document.getElementById('client-notify-name'),
  clientNotifyPhone: document.getElementById('client-notify-phone'),
  clientNotifyObservation: document.getElementById('client-notify-observation'),
  notifyError: document.getElementById('notify-error'),
  confirmNotifyButton: document.getElementById('confirm-notify-button'),
  cancelNotifyButton: document.getElementById('cancel-notify-button'),
  closeNotifyModalButton: document.getElementById('close-notify-modal-button'),
};

// ===== FUNÇÕES UTILITÁRIAS =====
function parsePrice(priceStr) { 
  if (!priceStr) return 0; 
  return parseFloat(priceStr.toString().replace(',', '.')) || 0; 
}

function formatPrice(price) { 
  return price.toFixed(2).replace('.', ','); 
}

function normalizeText(text) { 
  if (!text) return ''; 
  return text.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); 
}

function showStatus(message, isError = false) {
  if (isError) {
    elements.loadingStatus.style.display = 'none';
    elements.produtosSection.style.display = 'none';
    elements.errorSection.style.display = 'block';
    elements.errorDetails.textContent = message;
  } else {
    elements.loadingStatus.style.display = 'block';
    elements.produtosSection.style.display = 'none';
    elements.errorSection.style.display = 'none';
    elements.loadingStatus.innerHTML = `<div class="loading-spinner"></div><p class="mt-4 text-gray-600">${message}</p>`;
  }
}

function showSuccess() {
  elements.loadingStatus.style.display = 'none';
  elements.errorSection.style.display = 'none';
  elements.produtosSection.style.display = 'block';
}

function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') throw new Error('CSV inválido ou vazio');
  
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) throw new Error('CSV deve ter cabeçalho e dados');
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const required = ['SKU', 'NOME_SITE', 'PRECO', 'ESTOQUE', 'CATEGORIA', 'URL_FOTO'];
  
  if (required.some(col => !headers.includes(col))) {
    throw new Error(`Colunas ausentes: ${required.filter(c=>!headers.includes(c)).join(', ')}`);
  }
  
  return lines.slice(1).map(line => {
    const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = (values[index] || '').trim().replace(/^"|"$/g, '');
    });
    return obj;
  }).filter(item => item.SKU && item.NOME_SITE);
}

// ===== FUNÇÃO PARA DETERMINAR STATUS DO PRODUTO (CORRIGIDA) =====
function getProductStatus(product) {
  if (!product.isGranel) {
    // Produto unitário - permite compra com qualquer quantidade > 0
    if (product.stock <= 0) return 'out_of_stock';
    if (product.stock === 1) return 'low_stock'; // Última unidade
    return 'available';
  } else {
    // Produto a granel
    const stockInGrams = product.stock * 1000;
    if (stockInGrams <= 0) return 'out_of_stock';
    if (stockInGrams < CONFIG.MIN_GRANEL_QUANTITY) return 'out_of_stock'; // Não permite venda abaixo de 50g
    if (stockInGrams < CONFIG.LOW_STOCK_THRESHOLD) return 'low_stock'; // Entre 50-99g = estoque baixo
    return 'available';
  }
}

// ===== LAZY LOADING DE IMAGENS =====
function setupLazyLoading() {
  const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        
        if (src) {
          img.src = src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      }
    });
  }, {
    rootMargin: '50px 0px',
    threshold: 0.1
  });
  
  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
}

// ===== CARREGAMENTO INICIAL DO CARRINHO =====
function loadInitialCart() {
  try {
    const savedCart = loadCartFromLocalStorage();
    if (savedCart.length > 0) {
      cart = savedCart;
      renderCart();
    }
  } catch (error) {
    cart = [];
  }
}

// ===== VALIDAÇÃO DO CARRINHO =====
function validateCartWithProducts() {
  if (cart.length === 0) return;
  
  const validatedCart = [];
  let hasChanges = false;
  let removedItems = [];
  let adjustedItems = [];
  
  for (const cartItem of cart) {
    const currentProduct = products.find(p => 
      (p.id === cartItem.id) || 
      (p.sku === cartItem.sku) || 
      (p.sku === cartItem.id)
    );
    
    if (!currentProduct) {
      hasChanges = true;
      removedItems.push(cartItem.name || `Produto ${cartItem.sku || cartItem.id}`);
      continue;
    }
    
    // Verificar se produto está disponível
    const status = getProductStatus(currentProduct);
    if (status === 'out_of_stock') {
      hasChanges = true;
      removedItems.push(currentProduct.name);
      continue;
    }
    
    const maxStock = currentProduct.isGranel ? currentProduct.stock * 1000 : currentProduct.stock;
    let finalQuantity = cartItem.quantity;
    
    if (finalQuantity > maxStock) {
      finalQuantity = maxStock;
      hasChanges = true;
      adjustedItems.push({
        name: currentProduct.name,
        oldQty: cartItem.quantity,
        newQty: finalQuantity,
        unit: currentProduct.isGranel ? 'g' : ''
      });
    }
    
    validatedCart.push({
      ...currentProduct,
      quantity: finalQuantity
    });
  }
  
  cart = validatedCart;
  renderCart();
  
  if (removedItems.length > 0) {
    showNotification(`Removido(s) do carrinho: ${removedItems.join(', ')} (indisponível)`, 5000);
  }
  
  if (adjustedItems.length > 0) {
    adjustedItems.forEach(item => {
      showNotification(`${item.name}: quantidade ajustada para ${item.newQty}${item.unit} (estoque limitado)`, 4000);
    });
  }
  
  if (hasChanges) {
    saveCartToLocalStorage();
  }
}

// ===== CARREGAMENTO OTIMIZADO DE PRODUTOS =====
async function loadProducts() {
  if (isLoading) return;
  isLoading = true;
  
  const cachedProducts = getCachedProducts();
  if (cachedProducts) {
    products = cachedProducts;
    validateCartWithProducts();
    renderCategoryFilters();
    applyFilters();
    showSuccess();
    isLoading = false;
    
    loadProductsFromSheet(true);
    return;
  }
  
  await loadProductsFromSheet(false);
}

async function loadProductsFromSheet(isBackground = false) {
  if (!isBackground) {
    showStatus('Conectando com a planilha...');
  }
  
  try {
    let response;
    
    try {
      response = await fetch(CONFIG.SHEET_CSV_URL, {
        headers: {
          'Accept': 'text/csv,text/plain,*/*',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) throw new Error('Acesso direto falhou');
    } catch (directError) {
      if (!isBackground) showStatus('Conectando via proxy...');
      response = await fetchWithProxy(CONFIG.SHEET_CSV_URL);
    }

    if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
    
    if (!isBackground) showStatus('Processando dados da planilha...');
    const csvText = await response.text();
    
    if (!csvText.trim()) throw new Error('Planilha vazia ou inacessível');
    
    const rawData = parseCSV(csvText);
    
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const possibleClubColumns = headers.filter(h => 
      h.toUpperCase().includes('CLUB') || 
      h.toUpperCase().includes('CLUBE') || 
      h.toUpperCase().includes('VLR') ||
      h.toUpperCase().includes('DESCONTO') ||
      h.toUpperCase().includes('PROMO')
    );
    
    const newProducts = rawData.map((item, index) => {
      const isGranel = (item.CATEGORIA || '').toUpperCase() === 'GRANEL';
      const basePrice = parsePrice(item.PRECO);
      
      let stockValue;
      if (item.ESTOQUE) {
        stockValue = parseFloat(item.ESTOQUE.toString().replace(',', '.')) || 0;
      } else {
        stockValue = 0;
      }
      
      let clubPrice = 0;
      
      if (item.CLUB_VLR) {
        clubPrice = parsePrice(item.CLUB_VLR);
      }
      
      if (clubPrice === 0) {
        for (const col of possibleClubColumns) {
          if (item[col]) {
            const testPrice = parsePrice(item[col]);
            if (testPrice > 0) {
              clubPrice = testPrice;
              break;
            }
          }
        }
      }
      
      const finalClubPrice = clubPrice > 0 ? (isGranel ? clubPrice / 1000 : clubPrice) : null;
      
      const product = {
        id: parseInt(item.SKU) || index + Date.now(),
        sku: item.SKU || `ITEM${index + 1}`,
        name: item.NOME_SITE || 'Produto sem nome',
        price: isGranel ? basePrice / 1000 : basePrice,
        clubPrice: finalClubPrice,
        stock: stockValue,
        category: item.CATEGORIA || 'Outros',
        image: item.URL_FOTO || `https://placehold.co/300x200/166534/ffffff?text=${item.SKU}`,
        isGranel: isGranel,
        minQuantity: isGranel ? CONFIG.MIN_GRANEL_QUANTITY : 1,
        quantityStep: isGranel ? CONFIG.MIN_GRANEL_QUANTITY : 1,
      };
      
      product.status = getProductStatus(product);
      
      return product;
    }).filter(p => p.price > 0 && p.name !== 'Produto sem nome');
    
    if (newProducts.length === 0) {
      throw new Error('Nenhum produto válido encontrado na planilha.');
    }
    
    products = newProducts;
    setCachedProducts(products);
    
    if (!isBackground) {
      validateCartWithProducts();
      renderCategoryFilters();
      applyFilters();
      showSuccess();
    } else {
      validateCartWithProducts();
    }
    
  } catch (error) {
    if (!isBackground) {
      showStatus(`Erro: ${error.message}`, true);
      console.error('Erro ao carregar produtos:', error);
    }
  } finally {
    isLoading = false;
  }
}

// ===== RENDERIZAÇÃO DE CATEGORIAS (CORRIGIDA - SEM "FORA DE ESTOQUE") =====
function renderCategoryFilters() {
  const clubProducts = products.filter(p => p.clubPrice !== null && p.clubPrice > 0);
  
  // Contar produtos por categoria
  const categoryCount = {};
  products.forEach(p => {
    categoryCount[p.category] = (categoryCount[p.category] || 0) + 1;
  });
  
  // ADICIONADO: Produtos específicos na categoria SUPLEMENTOS
  const specificSupplementsProducts = products.filter(p => p.sku === '2' || p.sku === '409' || p.sku === '340');
  if (specificSupplementsProducts.length > 0) {
    categoryCount['SUPLEMENTOS'] = (categoryCount['SUPLEMENTOS'] || 0) + specificSupplementsProducts.length;
  }
  
  const originalCategories = [...new Set(products.map(p => p.category))];
  
  const displayCategories = [];
  let hasViaAromaCategories = false;
  let viaAromaCount = 0;
  
  originalCategories.forEach(category => {
    if (category === 'OLEO ESSENCIAL' || category === 'ESSENCIAS') {
      if (!hasViaAromaCategories) {
        displayCategories.push('VIAAROMA');
        hasViaAromaCategories = true;
      }
      viaAromaCount += categoryCount[category] || 0;
    } else {
      displayCategories.push(category);
    }
  });
  
  // Separar categorias especiais
  const regularCategories = displayCategories.filter(cat => cat !== 'GELADEIRA');
  const hasGeladeira = displayCategories.includes('GELADEIRA');
  
  let categories = [{ 
    name: 'Todos', 
    count: products.length
  }];
  
  // Adicionar categorias regulares primeiro
  regularCategories.forEach(cat => {
    if (cat === 'VIAAROMA') {
      categories.push({ 
        name: cat, 
        count: viaAromaCount
      });
    } else {
      categories.push({ 
        name: cat, 
        count: categoryCount[cat] || 0
      });
    }
  });
  
  // Adicionar GELADEIRA como penúltima (se existir)
  if (hasGeladeira) {
    categories.push({ 
      name: 'GELADEIRA', 
      count: categoryCount['GELADEIRA'] || 0
    });
  }
  
  // Adicionar Club NatuBrava como última categoria (se existir)
  if (clubProducts.length > 0) {
    categories.push({ 
      name: '⭐ Club NatuBrava', 
      count: clubProducts.length
    });
  }
  
  // REMOVIDO: Categoria "❌ Fora de Estoque"
  
  elements.categoryFilters.innerHTML = categories.map(cat => {
    let buttonClass = 'category-btn text-sm sm:text-base px-4 py-2 rounded-full';
    let buttonContent = cat.name;
    
    if (cat.name === '⭐ Club NatuBrava') {
      buttonClass += ' club-category-btn';
      buttonContent = `<span class="flex items-center"><ion-icon name="star" class="text-yellow-400 mr-1"></ion-icon>Club NatuBrava <span class="ml-2 text-xs bg-white bg-opacity-30 px-2 py-0.5 rounded-full">${cat.count}</span></span>`;
    } else {
      buttonContent = `${cat.name} <span class="text-xs ml-1 bg-green-700 bg-opacity-20 px-2 py-0.5 rounded-full">${cat.count}</span>`;
    }
    
    return `<button class="${buttonClass}" data-category="${cat.name}">${buttonContent}</button>`;
  }).join('');
}

// ===== APLICAR FILTROS E BUSCA (CORRIGIDO PARA SUPLEMENTOS) =====
function applyFilters() {
  const searchTerm = normalizeText(elements.searchBox.value);
  const searchTerms = searchTerm.split(' ').filter(t => t.length > 0);
  
  filteredProducts = products.filter(product => {
    // Se há busca, ignorar filtro de categoria e buscar globalmente
    if (searchTerms.length > 0) {
      const productText = normalizeText(`${product.name} ${product.sku}`);
      return searchTerms.every(term => productText.includes(term));
    }
    
    // Se não há busca, aplicar filtro de categoria
    if (currentFilter === 'Todos') {
      return true;
    } else if (currentFilter === '⭐ Club NatuBrava') {
      return product.clubPrice !== null && product.clubPrice > 0;
    } else if (currentFilter === 'VIAAROMA') {
      return product.category === 'OLEO ESSENCIAL' || product.category === 'ESSENCIAS';
    } else if (currentFilter === 'SUPLEMENTOS') {
      // ADICIONADO: Incluir produtos específicos na categoria SUPLEMENTOS
      return product.category === 'SUPLEMENTOS' || product.sku === '2' || product.sku === '409' || product.sku === '340';
    } else {
      return product.category === currentFilter;
    }
  });
  
  // Ordenar produtos
  filteredProducts.sort((a, b) => {
    const statusOrder = { 'available': 0, 'low_stock': 1, 'out_of_stock': 2 };
    if (a.status !== b.status) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    
    if (a.status === 'available' && b.status === 'available') {
      const aHasClub = a.clubPrice !== null && a.clubPrice > 0;
      const bHasClub = b.clubPrice !== null && b.clubPrice > 0;
      if (aHasClub && !bHasClub) return -1;
      if (!aHasClub && bHasClub) return 1;
    }
    
    return 0;
  });
  
  totalPages = Math.ceil(filteredProducts.length / CONFIG.ITEMS_PER_PAGE);
  currentPage = 1;
  
  renderProducts();
  renderPagination();
  updateProductCounter();
}

// ===== RENDERIZAÇÃO DE PRODUTOS =====
function renderProducts() {
  const startIndex = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
  const endIndex = startIndex + CONFIG.ITEMS_PER_PAGE;
  const pageProducts = filteredProducts.slice(startIndex, endIndex);
  
  elements.productList.innerHTML = '';
  elements.noProductsMessage.style.display = pageProducts.length === 0 ? 'block' : 'none';
  
  const fragment = document.createDocumentFragment();
  
  pageProducts.forEach(product => {
    const card = document.createElement('div');
    const isGranel = product.isGranel;
    const initialQty = isGranel ? 100 : 1; // Quantidade inicial: 100g para granel, 1 para unitário
    const hasClubPrice = product.clubPrice !== null && product.clubPrice > 0;
    const status = product.status;
    
    let cardClass = 'product-card bg-white rounded-lg shadow-md overflow-hidden';
    if (status === 'out_of_stock') {
      cardClass += ' out-of-stock-card';
    } else if (status === 'low_stock') {
      cardClass += ' low-stock-card';
    }
    if (hasClubPrice && status !== 'out_of_stock') {
      cardClass += ' club-product-card';
    }
    
    card.className = cardClass;
    card.style.animation = 'fadeInUp 0.5s ease-out';
    card.dataset.id = product.id;
    
    let priceHTML = '';
    let statusBadgeHTML = '';
    let quantityControlsHTML = '';
    let buttonHTML = '';
    
    // Badge de status
    if (status === 'out_of_stock') {
      statusBadgeHTML = '<div class="status-badge out-of-stock-badge">Produto Indisponível</div>';
    } else if (status === 'low_stock') {
      statusBadgeHTML = '<div class="status-badge low-stock-badge">Últimas Unidades</div>';
    }
    
    // Preços
    if (hasClubPrice && status !== 'out_of_stock') {
      const normalPrice = isGranel ? product.price * 100 : product.price;
      const clubPriceDisplay = isGranel ? product.clubPrice * 100 : product.clubPrice;
      priceHTML = `
        <div class="price-container">
          <div class="normal-price">De: <span class="original-price">R$ ${formatPrice(normalPrice)}${isGranel ? '/100g' : ''}</span></div>
          <div class="club-price-container">
            <span class="club-badge">CLUB</span>
            <span class="club-price">R$ ${formatPrice(clubPriceDisplay)}${isGranel ? '/100g' : ''}</span>
            <button class="club-info-icon ml-1 text-green-600 hover:text-green-800" onclick="openClubInfoModal()" title="Saiba mais sobre o Club NatuBrava">
              <ion-icon name="information-circle-outline" class="text-sm"></ion-icon>
            </button>
          </div>
        </div>`;
    } else {
      priceHTML = `<span class="text-lg font-bold text-green-700">R$ ${formatPrice(isGranel ? product.price * 100 : product.price)}${isGranel ? '/100g' : ''}</span>`;
    }
    
    // Controles de quantidade e botão
    if (status === 'out_of_stock') {
      quantityControlsHTML = '';
      buttonHTML = `
        <button class="notify-me-btn w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-1" data-product-id="${product.id}">
          <ion-icon name="notifications-outline" class="text-base"></ion-icon>
          <span>Avise-me assim que chegar</span>
        </button>`;
    } else {
      // Quantidade mínima para controles (50g para granel, 1 para unitário)
      const minQty = isGranel ? CONFIG.MIN_GRANEL_QUANTITY : 1;
      const maxQty = isGranel ? product.stock * 1000 : product.stock;
      
      quantityControlsHTML = `
        <div class="flex items-center space-x-1">
          <button class="product-quantity-change p-1 rounded-full bg-gray-100 hover:bg-gray-200" data-change="-1" ${initialQty <= minQty ? 'disabled' : ''}><ion-icon name="remove-outline" class="pointer-events-none"></ion-icon></button>
          <span class="product-quantity font-medium text-base ${isGranel ? 'w-16' : 'w-6'} text-center">${isGranel ? `${initialQty}g` : initialQty}</span>
          <button class="product-quantity-change p-1 rounded-full bg-gray-100 hover:bg-gray-200" data-change="1" ${initialQty >= maxQty ? 'disabled' : ''}><ion-icon name="add-outline" class="pointer-events-none"></ion-icon></button>
        </div>`;
      
      buttonHTML = `
        <button class="add-to-cart-btn w-full bg-green-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-green-700 flex items-center justify-center space-x-1">
          <ion-icon name="cart-outline" class="text-base"></ion-icon>
          <span>Adicionar</span>
        </button>`;
    }
    
    // Destacar termos de busca no nome
    let displayName = product.name;
    const searchTerm = elements.searchBox.value.trim();
    if (searchTerm) {
      const regex = new RegExp(`(${searchTerm.split(' ').join('|')})`, 'gi');
      displayName = displayName.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
    }
    
    const imageHTML = `
      <img data-src="${product.image}" 
           alt="${product.name}" 
           class="product-image ${status === 'out_of_stock' ? 'grayscale' : ''}" 
           loading="lazy"
           onerror="this.parentElement.innerHTML='<div class=\\'product-image-error\\'>Imagem<br>Indisponível</div>'">
    `;
    
    card.innerHTML = `
      <div class="product-image-container">
        ${imageHTML}
        ${statusBadgeHTML}
      </div>
      <div class="product-card-content">
        <h3 class="text-lg font-semibold text-green-800 mb-1">${displayName}</h3>
        <p class="text-sm text-gray-600 mb-2 flex-grow">Cód.: ${product.sku}</p>
        <div class="product-card-footer">
          <div class="flex justify-between items-center mb-3">
            ${priceHTML}
            ${quantityControlsHTML}
          </div>
          ${isGranel && status !== 'out_of_stock' ? `<div class="text-center mb-2"><span class="text-sm font-semibold text-green-800">Total: R$ <span class="product-total-price">${formatPrice((hasClubPrice ? product.clubPrice : product.price) * initialQty)}</span></span></div>` : ''}
          ${buttonHTML}
        </div>
      </div>`;
    
    fragment.appendChild(card);
  });
  
  elements.productList.appendChild(fragment);
  setupLazyLoading();
  
  document.querySelectorAll('#category-filters .category-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === currentFilter);
  });
  
  if (currentPage > 1) {
    elements.produtosSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ===== RENDERIZAR PAGINAÇÃO =====
function renderPagination() {
  if (!elements.pagination || totalPages <= 1) {
    if (elements.pagination) elements.pagination.style.display = 'none';
    return;
  }
  
  elements.pagination.style.display = 'flex';
  elements.pagination.innerHTML = '';
  
  const prevBtn = document.createElement('button');
  prevBtn.className = 'pagination-btn';
  prevBtn.innerHTML = '<ion-icon name="chevron-back-outline"></ion-icon>';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => goToPage(currentPage - 1);
  elements.pagination.appendChild(prevBtn);
  
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  
  if (endPage - startPage < maxVisiblePages - 1) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }
  
  if (startPage > 1) {
    const firstPageBtn = createPageButton(1);
    elements.pagination.appendChild(firstPageBtn);
    
    if (startPage > 2) {
      const dots = document.createElement('span');
      dots.className = 'pagination-dots';
      dots.textContent = '...';
      elements.pagination.appendChild(dots);
    }
  }
  
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = createPageButton(i);
    elements.pagination.appendChild(pageBtn);
  }
  
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const dots = document.createElement('span');
      dots.className = 'pagination-dots';
      dots.textContent = '...';
      elements.pagination.appendChild(dots);
    }
    
    const lastPageBtn = createPageButton(totalPages);
    elements.pagination.appendChild(lastPageBtn);
  }
  
  const nextBtn = document.createElement('button');
  nextBtn.className = 'pagination-btn';
  nextBtn.innerHTML = '<ion-icon name="chevron-forward-outline"></ion-icon>';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => goToPage(currentPage + 1);
  elements.pagination.appendChild(nextBtn);
}

function createPageButton(pageNumber) {
  const btn = document.createElement('button');
  btn.className = 'pagination-btn' + (pageNumber === currentPage ? ' active' : '');
  btn.textContent = pageNumber;
  btn.onclick = () => goToPage(pageNumber);
  return btn;
}

function goToPage(page) {
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderProducts();
  renderPagination();
}

// ===== ATUALIZAR CONTADOR DE PRODUTOS =====
function updateProductCounter() {
  if (!elements.productCounter) return;
  
  const total = filteredProducts.length;
  const start = total > 0 ? (currentPage - 1) * CONFIG.ITEMS_PER_PAGE + 1 : 0;
  const end = Math.min(currentPage * CONFIG.ITEMS_PER_PAGE, total);
  
  elements.productCounter.innerHTML = `
    Mostrando <strong>${start}-${end}</strong> de <strong>${total}</strong> produtos
  `;
}

// ===== BUSCA OTIMIZADA COM DEBOUNCE =====
function handleSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    applyFilters();
  }, 300);
}

// ===== CARRINHO =====
function triggerCartAnimation() {
  if (elements.cartButton) {
    elements.cartButton.classList.add('cart-bounce-animation');
    setTimeout(() => elements.cartButton.classList.remove('cart-bounce-animation'), 400);
  }
  if (elements.cartButtonMobile) {
    elements.cartButtonMobile.classList.add('cart-bounce-animation');
    setTimeout(() => elements.cartButtonMobile.classList.remove('cart-bounce-animation'), 400);
  }
}

// ===== ADICIONAR AO CARRINHO (CORRIGIDO) =====
function addToCart(productId, quantity) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  // Verificar se produto está disponível (corrigido para permitir low_stock)
  if (product.status === 'out_of_stock') {
    showNotification('Este produto não está disponível para compra no momento.');
    return;
  }

  // Verificação de quantidade mínima
  if (product.isGranel && quantity < CONFIG.MIN_GRANEL_QUANTITY) {
    showNotification(`Quantidade mínima para produtos a granel: ${CONFIG.MIN_GRANEL_QUANTITY}g`);
    return;
  }
  
  if (!product.isGranel && quantity < 1) {
    showNotification('Quantidade mínima: 1 unidade');
    return;
  }

  const existingItem = cart.find(item => item.id === productId);
  const currentQuantityInCart = existingItem ? existingItem.quantity : 0;
  const newTotalQuantity = currentQuantityInCart + quantity;
  const maxStock = product.isGranel ? product.stock * 1000 : product.stock;

  if (newTotalQuantity > maxStock) {
    const availableStock = maxStock - currentQuantityInCart;
    showNotification(`Estoque insuficiente. Você pode adicionar mais ${availableStock}${product.isGranel ? 'g' : ' unidade(s)'}.`);
    return;
  }

  const finalPrice = product.clubPrice || product.price;

  if (existingItem) {
    existingItem.quantity = newTotalQuantity;
    existingItem.price = finalPrice;
  } else {
    cart.push({ ...product, quantity, price: finalPrice });
  }
  
  triggerCartAnimation();
  showNotification(`${product.isGranel ? quantity+'g' : quantity+'x'} de ${product.name} adicionado!`);
  renderCart();
  saveCartToLocalStorage();
}

function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  renderCart();
  saveCartToLocalStorage();
}

function updateCartQuantity(productId, change) {
  const itemIndex = cart.findIndex(item => item.id === productId);
  if (itemIndex === -1) return;
  const item = cart[itemIndex];
  
  const currentProduct = products.find(p => p.id === productId);
  const step = currentProduct ? (currentProduct.isGranel ? currentProduct.quantityStep : 1) : (item.isGranel ? CONFIG.MIN_GRANEL_QUANTITY : 1);
  const minQty = currentProduct ? (currentProduct.isGranel ? currentProduct.minQuantity : 1) : (item.isGranel ? CONFIG.MIN_GRANEL_QUANTITY : 1);
  
  let newQuantity = item.quantity + (change * step);
  const maxStock = currentProduct ? (currentProduct.isGranel ? currentProduct.stock * 1000 : currentProduct.stock) : 9999;

  if (newQuantity < minQty) {
    removeFromCart(productId);
  } else if (newQuantity <= maxStock) {
    item.quantity = newQuantity;
    if (currentProduct && currentProduct.clubPrice) {
      item.price = currentProduct.clubPrice;
    }
    renderCart();
    saveCartToLocalStorage();
  } else {
    showNotification(`Estoque máximo atingido: ${maxStock}${item.isGranel ? 'g' : ''}`);
  }
}

function renderCart() {
  elements.cartItems.innerHTML = '';
  let total = 0;
  elements.cartEmptyMessage.style.display = cart.length === 0 ? 'block' : 'none';

  if (cart.length > 0) {
    cart.forEach(item => {
      const itemTotal = item.price * item.quantity;
      total += itemTotal;
      const itemElement = document.createElement('div');
      itemElement.className = 'flex items-center justify-between border-b pb-3 pt-1';
      
      itemElement.innerHTML = `
        <div class="flex items-center space-x-3 flex-grow min-w-0">
          <img src="${item.image}" alt="${item.name}" class="w-12 h-12 rounded object-cover flex-shrink-0">
          <div class="flex-grow min-w-0">
            <p class="font-medium text-sm truncate">${item.name}</p>
            <div class="flex items-center space-x-1 mt-1">
              <button class="cart-quantity-change text-gray-500 hover:text-black p-0.5 rounded bg-gray-100 hover:bg-gray-200" data-id="${item.id}" data-change="-1">
                <ion-icon name="remove-outline" class="text-sm pointer-events-none"></ion-icon>
              </button>
              <span class="text-sm font-medium w-12 text-center">${item.isGranel ? `${item.quantity}g` : item.quantity}</span>
              <button class="cart-quantity-change text-gray-500 hover:text-black p-0.5 rounded bg-gray-100 hover:bg-gray-200" data-id="${item.id}" data-change="1">
                <ion-icon name="add-outline" class="text-sm pointer-events-none"></ion-icon>
              </button>
            </div>
          </div>
        </div>
        <div class="flex flex-col items-end justify-center ml-2">
          <span class="font-semibold text-sm">R$ ${formatPrice(itemTotal)}</span>
          <button class="remove-item text-red-500 text-lg p-1 mt-1" data-id="${item.id}"><ion-icon name="trash-outline" class="pointer-events-none"></ion-icon></button>
        </div>`;
      elements.cartItems.appendChild(itemElement);
    });
  }
  
  const cartLength = cart.length;
  if (elements.cartCount) {
    elements.cartCount.textContent = cartLength;
  }
  if (elements.cartCountMobile) {
    elements.cartCountMobile.textContent = cartLength;
  }
  
  elements.cartTotal.textContent = `R$ ${formatPrice(total)}`;
  elements.checkoutButton.disabled = cart.length === 0;
}

// ===== VALIDAÇÃO DO MODAL "AVISE-ME" (REMOVIDA - BOTÃO SEMPRE ATIVO) =====
// Função removida - botão sempre ativo, validação na hora do envio

// ===== MODAIS =====
function openCartPanel() { 
  elements.cartPanel.classList.add('open'); 
  elements.cartOverlay.classList.add('open'); 
  document.body.style.overflow = 'hidden';
}

function closeCartPanel() { 
  elements.cartPanel.classList.remove('open'); 
  elements.cartOverlay.classList.remove('open'); 
  document.body.style.overflow = '';
}

function openNameModal() { 
  elements.nameModalOverlay.classList.add('open'); 
  elements.nameModalOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    elements.nameModal.style.transform = 'scale(1)';
    elements.nameModal.style.opacity = '1';
  }, 50);
}

function closeNameModal() {
  elements.nameModal.style.transform = 'scale(0.95)';
  elements.nameModal.style.opacity = '0';
  setTimeout(() => {
    elements.nameModalOverlay.classList.remove('open');
    elements.nameModalOverlay.style.display = 'none';
    document.body.style.overflow = '';
  }, 300);
  elements.nameError.classList.add('hidden');
  elements.clientNameInput.classList.remove('border-red-500');
  elements.clientNameInput.value = '';
  elements.clientObservation.value = '';
}

function openNotifyModal(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  document.getElementById('notify-product-name').textContent = product.name;
  document.getElementById('notify-product-sku').textContent = product.sku;
  
  elements.notifyModalOverlay.classList.add('open');
  elements.notifyModalOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    elements.notifyModal.style.transform = 'scale(1)';
    elements.notifyModal.style.opacity = '1';
  }, 50);
  
  elements.notifyModal.dataset.productId = productId;
}

function closeNotifyModal() {
  elements.notifyModal.style.transform = 'scale(0.95)';
  elements.notifyModal.style.opacity = '0';
  setTimeout(() => {
    elements.notifyModalOverlay.classList.remove('open');
    elements.notifyModalOverlay.style.display = 'none';
    document.body.style.overflow = '';
  }, 300);
  
  elements.notifyError.classList.add('hidden');
  elements.clientNotifyName.classList.remove('border-red-500');
  elements.clientNotifyPhone.classList.remove('border-red-500');
  elements.clientNotifyName.value = '';
  elements.clientNotifyPhone.value = '';
  elements.clientNotifyObservation.value = '';
  delete elements.notifyModal.dataset.productId;
}

function sendNotifyRequest() {
  const productId = parseInt(elements.notifyModal.dataset.productId);
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  const clientName = elements.clientNotifyName.value.trim();
  const clientPhone = elements.clientNotifyPhone.value.trim();
  const observation = elements.clientNotifyObservation.value.trim();
  
  // CORRIGIDO: Validação igual ao modal do carrinho
  let hasError = false;
  
  // Resetar estilos de erro
  elements.clientNotifyName.classList.remove('border-red-500');
  elements.clientNotifyPhone.classList.remove('border-red-500');
  elements.notifyError.classList.add('hidden');
  
  if (!clientName) {
    elements.clientNotifyName.classList.add('border-red-500');
    hasError = true;
  }
  
  if (!clientPhone) {
    elements.clientNotifyPhone.classList.add('border-red-500');
    hasError = true;
  }
  
  if (hasError) {
    elements.notifyError.classList.remove('hidden');
    return;
  }
  
  // Se chegou aqui, os dados estão válidos
  let message = `🔔 *AVISO DE INTERESSE EM PRODUTO*\n\n`;
  message += `*Cliente:* ${clientName}\n`;
  message += `*Telefone:* ${clientPhone}\n\n`;
  message += `*PRODUTO SOLICITADO*\n`;
  message += `*Nome:* ${product.name}\n`;
  message += `*SKU:* ${product.sku}\n`;
  message += `*Categoria:* ${product.category}\n\n`;
  
  if (observation) {
    message += `*Observações do cliente:* ${observation}\n\n`;
  }
  
  message += `📋 *O cliente gostaria de ser avisado quando este produto voltar ao estoque.*\n\n`;
  message += `⚠️ *Status atual:* Produto Indisponível\n`;
  message += `📞 *Contato do cliente:* ${clientPhone}\n\n`;
  message += `✅ Por favor, incluir este cliente na lista de interessados no produto e avisar quando houver reestoque.\n\n`;
  message += `Mensagem enviada automaticamente pelo site NatuBrava.`;
  
  window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
  
  closeNotifyModal();
  showNotification('✅ Seu interesse foi registrado! Entraremos em contato quando o produto estiver disponível.', 5000);
}

function openDeliveryModal() { 
  elements.deliveryModalOverlay.classList.add('open'); 
  elements.deliveryModalOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    document.querySelector('#delivery-modal').style.transform = 'scale(1)';
    document.querySelector('#delivery-modal').style.opacity = '1';
  }, 50);
}

function closeDeliveryModal() { 
  document.querySelector('#delivery-modal').style.transform = 'scale(0.95)';
  document.querySelector('#delivery-modal').style.opacity = '0';
  setTimeout(() => {
    elements.deliveryModalOverlay.classList.remove('open'); 
    elements.deliveryModalOverlay.style.display = 'none';
    document.body.style.overflow = '';
  }, 300);
}

function openClubInfoModal() { 
  elements.clubInfoModalOverlay.classList.add('open'); 
  elements.clubInfoModalOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    document.querySelector('#club-info-modal').style.transform = 'scale(1)';
    document.querySelector('#club-info-modal').style.opacity = '1';
  }, 50);
}

function closeClubInfoModal() { 
  document.querySelector('#club-info-modal').style.transform = 'scale(0.95)';
  document.querySelector('#club-info-modal').style.opacity = '0';
  setTimeout(() => {
    elements.clubInfoModalOverlay.classList.remove('open'); 
    elements.clubInfoModalOverlay.style.display = 'none';
    document.body.style.overflow = '';
  }, 300);
}

function toggleMobileMenu() {
  const isOpen = !elements.mobileMenu.classList.contains('hidden');
  if (isOpen) {
    elements.mobileMenu.classList.add('hidden');
    elements.mobileMenuButton.innerHTML = '<ion-icon name="menu-outline" class="text-2xl"></ion-icon>';
  } else {
    elements.mobileMenu.classList.remove('hidden');
    elements.mobileMenuButton.innerHTML = '<ion-icon name="close-outline" class="text-2xl"></ion-icon>';
  }
}

function closeMobileMenu() {
  elements.mobileMenu.classList.add('hidden');
  elements.mobileMenuButton.innerHTML = '<ion-icon name="menu-outline" class="text-2xl"></ion-icon>';
}

function showNotification(message, duration = 3000) {
  const notification = document.createElement('div');
  notification.className = 'cart-notification fixed bottom-5 right-5 bg-green-600 text-white py-2 px-4 rounded-lg shadow-lg z-50';
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), duration);
}

// ===== SCROLL TO TOP =====
function handleScroll() {
  if (elements.backToTop) {
    if (window.pageYOffset > CONFIG.SCROLL_THRESHOLD) {
      elements.backToTop.classList.add('show');
    } else {
      elements.backToTop.classList.remove('show');
    }
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  if (elements.cartButton) {
    elements.cartButton.addEventListener('click', (e) => {
      e.preventDefault();
      openCartPanel();
    });
  }
  
  if (elements.cartButtonMobile) {
    elements.cartButtonMobile.addEventListener('click', (e) => {
      e.preventDefault();
      openCartPanel();
    });
  }
  
  elements.closeCartButton.addEventListener('click', closeCartPanel);
  elements.cartOverlay.addEventListener('click', closeCartPanel);
  elements.retryButton.addEventListener('click', loadProducts);
  elements.searchBox.addEventListener('input', handleSearch);
  
  if (elements.backToTop) {
    elements.backToTop.addEventListener('click', scrollToTop);
  }
  
  window.addEventListener('scroll', handleScroll);
  
  if (elements.deliveryInfoButton) {
    elements.deliveryInfoButton.addEventListener('click', (e) => {
      e.preventDefault();
      openDeliveryModal();
    });
  }
  
  if (elements.closeDeliveryModalButton) {
    elements.closeDeliveryModalButton.addEventListener('click', closeDeliveryModal);
  }
  
  if (elements.okDeliveryModalButton) {
    elements.okDeliveryModalButton.addEventListener('click', closeDeliveryModal);
  }
  
  if (elements.deliveryModalOverlay) {
    elements.deliveryModalOverlay.addEventListener('click', (e) => {
      if (e.target === elements.deliveryModalOverlay) closeDeliveryModal();
    });
  }

  if (elements.clubInfoButton) {
    elements.clubInfoButton.addEventListener('click', (e) => {
      e.preventDefault();
      openClubInfoModal();
    });
  }
  
  if (elements.clubInfoButtonMobile) {
    elements.clubInfoButtonMobile.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileMenu();
      openClubInfoModal();
    });
  }
  
  if (elements.deliveryInfoButtonMobile) {
    elements.deliveryInfoButtonMobile.addEventListener('click', (e) => {
      e.preventDefault();
      closeMobileMenu();
      openDeliveryModal();
    });
  }
  
  if (elements.closeClubModalButton) {
    elements.closeClubModalButton.addEventListener('click', closeClubInfoModal);
  }
  
  if (elements.clubInfoModalOverlay) {
    elements.clubInfoModalOverlay.addEventListener('click', (e) => {
      if (e.target === elements.clubInfoModalOverlay) closeClubInfoModal();
    });
  }

  if (elements.mobileMenuButton) {
    elements.mobileMenuButton.addEventListener('click', (e) => {
      e.preventDefault();
      toggleMobileMenu();
    });
  }

  elements.mobileMenu.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      closeMobileMenu();
    }
  });

  if (elements.closeNotifyModalButton) {
    elements.closeNotifyModalButton.addEventListener('click', closeNotifyModal);
  }
  
  if (elements.cancelNotifyButton) {
    elements.cancelNotifyButton.addEventListener('click', closeNotifyModal);
  }
  
  if (elements.confirmNotifyButton) {
    elements.confirmNotifyButton.addEventListener('click', sendNotifyRequest);
  }
  
  // REMOVIDO: Event listener que fechava modal ao clicar fora
  // Modal "Avise-me" só fecha com X ou enviando mensagem

  elements.categoryFilters.addEventListener('click', e => {
    if (e.target.matches('.category-btn') || e.target.closest('.category-btn')) {
      const button = e.target.closest('.category-btn') || e.target;
      currentFilter = button.dataset.category;
      applyFilters();
    }
  });

  // ===== EVENT LISTENER PARA PRODUTOS (CORRIGIDO) =====
  elements.productList.addEventListener('click', e => {
    const card = e.target.closest('.product-card');
    if (!card) return;
    
    const productId = parseInt(card.dataset.id);
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    if (e.target.closest('.notify-me-btn')) {
      e.preventDefault();
      e.stopPropagation();
      openNotifyModal(productId);
      return;
    }
    
    const qtySpan = card.querySelector('.product-quantity');
    const isGranel = product.isGranel;
    const hasClubPrice = product.clubPrice !== null && product.clubPrice > 0;

    if (e.target.closest('.add-to-cart-btn')) {
      e.preventDefault();
      e.stopPropagation();
      
      let quantityText = qtySpan.textContent.trim();
      let quantity;
      
      if (isGranel) {
        quantity = parseInt(quantityText.replace('g', ''));
      } else {
        quantity = parseInt(quantityText);
      }
      
      if (isNaN(quantity) || quantity <= 0) {
        showNotification('Erro: quantidade inválida');
        return;
      }
      
      addToCart(productId, quantity);
    } 
    else if (e.target.closest('.product-quantity-change')) {
      e.preventDefault();
      e.stopPropagation();
      
      const changeBtn = e.target.closest('[data-change]');
      const change = parseInt(changeBtn.dataset.change);
      let currentQty = parseInt(qtySpan.textContent.replace('g', ''));
      
      // Calcular nova quantidade
      let newQty;
      if (isGranel) {
        newQty = currentQty + (change * CONFIG.MIN_GRANEL_QUANTITY);
      } else {
        newQty = currentQty + change;
      }
      
      // Definir limites
      const minQty = isGranel ? CONFIG.MIN_GRANEL_QUANTITY : 1;
      const maxQty = isGranel ? product.stock * 1000 : product.stock;

      // Verificar se a nova quantidade está dentro dos limites
      if (newQty >= minQty && newQty <= maxQty) {
        qtySpan.textContent = isGranel ? `${newQty}g` : newQty;
        
        // Atualizar total para produtos a granel
        if (isGranel) {
          const priceToUse = hasClubPrice ? product.clubPrice : product.price;
          const totalPriceSpan = card.querySelector('.product-total-price');
          if (totalPriceSpan) {
            totalPriceSpan.textContent = formatPrice(priceToUse * newQty);
          }
        }
        
        // Atualizar estado dos botões
        const decreaseBtn = card.querySelector('[data-change="-1"]');
        const increaseBtn = card.querySelector('[data-change="1"]');
        
        if (decreaseBtn) {
          decreaseBtn.disabled = newQty <= minQty;
        }
        if (increaseBtn) {
          increaseBtn.disabled = newQty >= maxQty;
        }
      } else {
        // Quantidade fora dos limites - mostrar notificação
        if (newQty < minQty) {
          showNotification(`Quantidade mínima: ${minQty}${isGranel ? 'g' : ''}`);
        } else if (newQty > maxQty) {
          showNotification(`Estoque máximo: ${maxQty}${isGranel ? 'g' : ''}`);
        }
      }
    }
  });

  elements.cartItems.addEventListener('click', e => {
    const removeButton = e.target.closest('.remove-item');
    if (removeButton) {
      removeFromCart(parseInt(removeButton.dataset.id));
      return;
    }
    
    const quantityButton = e.target.closest('.cart-quantity-change');
    if (quantityButton) {
      updateCartQuantity(parseInt(quantityButton.dataset.id), parseInt(quantityButton.dataset.change));
    }
  });

  elements.checkoutButton.addEventListener('click', () => {
    if (cart.length > 0) openNameModal();
  });
  
  elements.cancelCheckoutButton.addEventListener('click', closeNameModal);
  
  elements.confirmCheckoutButton.addEventListener('click', () => {
    const clientName = elements.clientNameInput.value.trim();
    if (!clientName) {
      elements.nameError.classList.remove('hidden');
      elements.clientNameInput.classList.add('border-red-500');
      return;
    }
    
    const observation = elements.clientObservation.value.trim();
    
    let total = 0;
    let message = `Olá NatuBrava!\n*Pedido de:* ${clientName}\n\n*RESUMO DO PEDIDO*\n`;
    cart.forEach(item => {
      const itemTotal = item.price * item.quantity;
      total += itemTotal;
      
      const originalProduct = products.find(p => p.id === item.id);
      const isClubPrice = originalProduct && originalProduct.clubPrice && item.price === originalProduct.clubPrice;
      const priceLabel = isClubPrice ? ' (CLUB NATUBRAVA)' : '';
      
      message += `-----------------------------------\n*Produto:* ${item.name}${priceLabel}\n*SKU:* ${item.sku}\n*Quantidade:* ${item.isGranel ? `${item.quantity}g` : `Qtd: ${item.quantity}`}\n*Subtotal:* R$ ${formatPrice(itemTotal)}\n`;
    });
    message += `-----------------------------------\n\n*TOTAL GERAL: R$ ${formatPrice(total)}*\n`;
    
    if (observation) {
        message += `\n*Observações:* ${observation}\n`;
    }

    message += `\n📋 *Este pedido é para confirmação de estoque e valores.*\nEstou ciente de que os preços apresentados no catálogo online são informativos e podem sofrer alterações.\n\n✅ Aguardo confirmação de disponibilidade e valores atualizados.\n\nObrigado!`;
    
    window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank');
    
    closeNameModal();
  });
  
  // REMOVIDO: Validação em tempo real do modal "Avise-me"
  // Agora botão fica sempre ativo, validação apenas no envio
  
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') {
      closeCartPanel();
      closeNameModal();
      closeDeliveryModal();
      closeClubInfoModal();
      closeNotifyModal();
      closeMobileMenu();
    }
  });
}

// ===== FUNÇÃO GLOBAL PARA MODAL DO CLUB =====
window.openClubInfoModal = openClubInfoModal;

// ===== INICIALIZAÇÃO =====
document.addEventListener('DOMContentLoaded', () => {
  elements.currentYear.textContent = new Date().getFullYear();
  setupEventListeners();
  loadInitialCart();
  loadProducts();
});
