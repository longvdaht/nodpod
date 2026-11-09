/**
 * NP Bundle builder (Presidio Plus mix & match)
 *
 * 1. Cart refresh: Presidio dispatches `theme:cart:refresh` on document + window
 *    after POST /cart/add.js. We refresh/open the store's cart drawer (UpCart),
 *    falling back to the theme's own cart drawer / cart bubble.
 * 2. Enhancements on the Presidio markup: card ratings/subtitles/badges,
 *    sidebar labels, banners inside the product grid. Presidio renders in light
 *    DOM and re-renders cards on tab/page change, so everything is idempotent
 *    and re-run from a MutationObserver.
 * 3. Quick view popup opened from a card's image/title. "Add to bundle" in the
 *    popup clicks the matching Presidio card button, so bundle state, limits
 *    and pricing stay owned by the app.
 */
(function () {
  'use strict';

  var CART_EVENT = 'theme:cart:refresh';
  var VARIANT_GID = 'gid://shopify/ProductVariant/';

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  function readJSON(node) {
    if (!node) return null;
    try {
      return JSON.parse(node.textContent || 'null');
    } catch (e) {
      return null;
    }
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function setText(node, text) {
    if (node && text && node.textContent !== text) node.textContent = text;
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
  }

  function formatCount(n) {
    var num = Number(n);
    return isFinite(num) ? num.toLocaleString('en-US') : String(n);
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* 1. Cart refresh                                                     */
  /* ------------------------------------------------------------------ */

  var refreshing = false;

  function shouldOpenCart() {
    var root = document.querySelector('[data-np-bundle]');
    return !root || root.getAttribute('data-open-cart') !== 'false';
  }

  function refreshThemeCart(cart) {
    var cartDrawer = document.querySelector('cart-drawer');
    var sectionIds = ['cart-icon-bubble'];
    if (cartDrawer) sectionIds.push('cart-drawer');

    return fetch(window.location.pathname + '?sections=' + sectionIds.join(','))
      .then(function (res) {
        return res.json();
      })
      .then(function (sections) {
        var parse = function (html, selector) {
          return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
        };

        var bubble = document.getElementById('cart-icon-bubble');
        if (bubble && sections['cart-icon-bubble']) {
          var newBubble = parse(sections['cart-icon-bubble'], '.shopify-section');
          if (newBubble) bubble.innerHTML = newBubble.innerHTML;
        }

        if (cartDrawer && sections['cart-drawer']) {
          var newDrawer = parse(sections['cart-drawer'], '#CartDrawer');
          var current = cartDrawer.querySelector('#CartDrawer');
          if (newDrawer && current) current.innerHTML = newDrawer.innerHTML;
          cartDrawer.classList.remove('is-empty');
          var overlay = cartDrawer.querySelector('#CartDrawer-Overlay');
          if (overlay && typeof cartDrawer.close === 'function') {
            overlay.addEventListener('click', cartDrawer.close.bind(cartDrawer));
          }
          if (shouldOpenCart() && typeof cartDrawer.open === 'function') cartDrawer.open();
        }

        if (typeof window.publish === 'function' && window.PUB_SUB_EVENTS) {
          window.publish(window.PUB_SUB_EVENTS.cartUpdate, { source: 'np-bundle-builder', cartData: cart });
        }
      });
  }

  function onCartRefresh(event) {
    if (refreshing) return;
    refreshing = true;
    var cart = event && event.detail ? event.detail.cart : null;
    var done = function () {
      refreshing = false;
    };

    var job;
    if (typeof window.upcartRefreshCart === 'function') {
      job = Promise.resolve(window.upcartRefreshCart()).then(function () {
        if (shouldOpenCart() && typeof window.upcartOpenCart === 'function') window.upcartOpenCart();
      });
    } else {
      job = refreshThemeCart(cart);
    }

    job
      .catch(function (err) {
        console.error('[np-bundle-builder] cart refresh failed', err);
      })
      .then(done, done);
  }

  // Presidio fires the event on both document and window; a document event
  // also reaches window listeners, so listen on document only.
  document.addEventListener(CART_EVENT, onCartRefresh);

  /* ------------------------------------------------------------------ */
  /* 2. Presidio markup enhancements                                     */
  /* ------------------------------------------------------------------ */

  function buildRating(meta, opts) {
    var rating = parseFloat(meta.rating);
    if (!rating) return null;
    opts = opts || {};
    var wrap = el('div', opts.className || 'np-card-rating');
    var stars = el('span', 'np-stars', '★★★★★');
    stars.style.setProperty('--np-rating', String(Math.min(5, Math.max(0, rating))));
    stars.setAttribute('aria-hidden', 'true');
    wrap.appendChild(stars);
    wrap.appendChild(el('span', 'visually-hidden', rating.toFixed(1) + ' out of 5 stars'));
    if (meta.count) {
      var count = parseInt(meta.count, 10);
      var label = formatCount(meta.count) + (count === 1 ? ' Review' : ' Reviews');
      var countEl;
      if (opts.href) {
        countEl = el('a', 'np-rating-count', label);
        countEl.href = opts.href;
      } else {
        countEl = el('span', 'np-rating-count', label);
      }
      wrap.appendChild(countEl);
    }
    return wrap;
  }

  function decorateCards(app, meta) {
    app.querySelectorAll('.pre-product-card:not([data-np-decorated])').forEach(function (card) {
      card.setAttribute('data-np-decorated', '');
      var data = meta[card.getAttribute('data-pre-product-id')];
      if (!data) return;

      var heading = card.querySelector('.pre-product-card__heading');
      if (heading) {
        var rating = buildRating(data);
        if (rating) heading.insertBefore(rating, heading.firstChild);
        if (data.subtitle) heading.appendChild(el('p', 'np-card-subtitle', data.subtitle));
      }

      if (data.badge) {
        var media = card.querySelector('.pre-product-card__media');
        var saleBadge = card.querySelector('.pre-product-card__badge');
        if (media && (!saleBadge || saleBadge.classList.contains('pre-is-hidden'))) {
          media.appendChild(el('span', 'np-card-badge', data.badge));
        }
      }
    });
  }

  function placeGridBanners(app, templates) {
    if (!templates.length) return;
    var grid = app.querySelector('.pre-bundle-products-grid');
    if (!grid) return;
    var cards = Array.prototype.filter.call(grid.children, function (child) {
      return child.classList.contains('pre-product-card');
    });

    templates.forEach(function (tpl) {
      var id = tpl.getAttribute('data-id');
      var after = parseInt(tpl.getAttribute('data-after'), 10) || 1;
      var banner = grid.querySelector('[data-np-banner="' + cssEscape(id) + '"]');
      var anchor = cards[Math.min(after, cards.length) - 1];

      if (!anchor) {
        if (banner) banner.remove();
        return;
      }
      if (!banner) {
        var source = tpl.content.firstElementChild;
        if (!source) return;
        banner = source.cloneNode(true);
        banner.setAttribute('data-np-banner', id);
      }
      if (anchor.nextElementSibling !== banner) anchor.after(banner);
    });
  }

  // Presidio renders the selected-product images for a 44px thumbnail
  // (sizes="44px", srcset up to 132w). Our tiles are ~64-200px, so swap in
  // larger Shopify CDN renditions of the same file. Only attributes change, so
  // this doesn't retrigger the childList MutationObserver.
  var TILE_WIDTHS = [200, 300, 400, 600];

  function cdnWidth(url, width) {
    if (!url) return url;
    if (/[?&]width=\d+/.test(url)) return url.replace(/([?&])width=\d+/, '$1width=' + width);
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'width=' + width;
  }

  function upscaleTileImages(widget) {
    widget.querySelectorAll('.pre-bundle-placeholder__filled .pre-product-inline__image img').forEach(function (img) {
      var src = img.getAttribute('src');
      if (!src || img.getAttribute('data-np-src') === src) return;
      var large = cdnWidth(src, 400);
      img.setAttribute(
        'srcset',
        TILE_WIDTHS.map(function (w) {
          return cdnWidth(src, w) + ' ' + w + 'w';
        }).join(', ')
      );
      img.setAttribute('sizes', '(min-width: 750px) 200px, 64px');
      img.setAttribute('src', large);
      img.setAttribute('data-np-src', large);
    });
  }

  // "View More": Presidio renders every product (products_per_page forced to
  // 0 below); we show `step` cards and reveal `step` more per click. The count
  // resets when the active tab or the number of cards changes. Only classes
  // change on cards, so the childList MutationObserver isn't retriggered.
  function applyViewMore(app, state) {
    if (!state.step) return;
    var grid = app.querySelector('.pre-bundle-products-grid');
    if (!grid) return;

    var cards = Array.prototype.filter.call(grid.children, function (child) {
      return child.classList.contains('pre-product-card');
    });
    var activeTab = app.querySelector('.pre-bundle-tab--active');
    var key = (activeTab ? activeTab.getAttribute('data-pre-group-id') || activeTab.textContent : 'all') + ':' + cards.length;
    if (key !== state.key) {
      state.key = key;
      state.visible = state.step;
    }

    cards.forEach(function (card, i) {
      card.classList.toggle('np-is-hidden', i >= state.visible);
    });
    // Grid banners anchored to a hidden card stay hidden too.
    grid.querySelectorAll('[data-np-banner]').forEach(function (banner) {
      var prev = banner.previousElementSibling;
      banner.classList.toggle('np-is-hidden', !!(prev && prev.classList.contains('np-is-hidden')));
    });

    var wrap = app.querySelector('.np-view-more');
    if (!wrap) {
      wrap = el('div', 'np-view-more');
      var btn = el('button', 'np-view-more__btn', state.label);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        var firstNew = state.visible;
        state.visible += state.step;
        applyViewMore(app, state);
        var currentGrid = app.querySelector('.pre-bundle-products-grid');
        var next = currentGrid && currentGrid.querySelectorAll('.pre-product-card')[firstNew];
        var focusTarget = next && next.querySelector('a, button');
        if (focusTarget) focusTarget.focus({ preventScroll: true });
      });
      wrap.appendChild(btn);
    }
    if (grid.nextElementSibling !== wrap) grid.after(wrap);
    wrap.hidden = cards.length <= state.visible;
  }

  function discountLabel(config) {
    if (!config || !config.discountValue) return '';
    var value = parseFloat(config.discountValue);
    if (!value) return '';
    if (config.discountType === 'percent' || config.discountType === 'percentage') {
      return (value % 1 === 0 ? value.toFixed(0) : value) + '% OFF';
    }
    return '';
  }

  function decorateSidebar(app, opts) {
    var widget = app.querySelector('.pre-bundle-widget');
    if (!widget) return;

    setText(widget.querySelector('.pre-bundle-title'), opts.title);
    setText(widget.querySelector('.pre-bundle-subtitle'), opts.subtitle);

    var price = widget.querySelector('.pre-bundle-price');
    if (!price) return;
    price.classList.add('np-summary');

    var rowLabel = function (modifier, text) {
      var row = price.querySelector('.pre-bundle-price-row--' + modifier);
      if (row) setText(row.querySelector('span:not(.money):not(.np-pill)'), text);
      return row;
    };
    rowLabel('subtotal', opts.labels.subtotal);
    var savingsRow = rowLabel('savings', opts.labels.discount);
    rowLabel('total', opts.labels.total);

    var itemsRow = price.querySelector('.np-summary__items');
    if (!itemsRow) {
      itemsRow = el('div', 'pre-bundle-price-row np-summary__items');
      itemsRow.appendChild(el('span', null, opts.labels.items));
      itemsRow.appendChild(el('span', 'np-summary__count', '0'));
      price.insertBefore(itemsRow, price.firstChild);
    }
    var count = widget.querySelectorAll('.pre-bundle-placeholder__filled .pre-product-inline').length;
    setText(itemsRow.querySelector('.np-summary__count'), String(count));

    upscaleTileImages(widget);

    if (savingsRow && opts.pill && !savingsRow.querySelector('.np-pill')) {
      savingsRow.appendChild(el('span', 'np-pill', opts.pill));
      savingsRow.classList.add('np-has-pill');
    }
  }

  /* ------------------------------------------------------------------ */
  /* 3. Quick view                                                       */
  /* ------------------------------------------------------------------ */

  function QuickView(root, app, meta, config) {
    this.root = root;
    this.app = app;
    this.meta = meta;
    this.dialog = root.querySelector('[data-np-qv]');
    this.bundleVariantIds = this.collectBundleVariants(config);
    this.product = null;
    this.productGid = null;
    this.variant = null;
    this.slide = 0;
    this.images = [];
    if (this.dialog) this.bind();
  }

  QuickView.prototype.collectBundleVariants = function (config) {
    var map = {};
    if (!config || !config.products) return map;
    config.products.forEach(function (p) {
      map[p.gid] = (p.variants || []).map(function (v) {
        return String(v.id);
      });
    });
    return map;
  };

  QuickView.prototype.q = function (selector) {
    return this.dialog.querySelector(selector);
  };

  QuickView.prototype.bind = function () {
    var self = this;

    // Capture phase so we can stop the card link before navigation.
    this.app.addEventListener(
      'click',
      function (event) {
        var link = event.target.closest('.pre-product-card__link');
        if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
        var card = link.closest('.pre-product-card');
        var productGid = card && card.getAttribute('data-pre-product-id');
        if (!productGid || !self.meta[productGid]) return;

        var variantGid = card.getAttribute('data-pre-variant-id');
        if (!variantGid) {
          var select = card.querySelector('select.pre-variant-selector');
          if (select) variantGid = select.value;
        }
        event.preventDefault();
        event.stopPropagation();
        self.open(productGid, variantGid);
      },
      true
    );

    this.q('[data-np-qv-close]').addEventListener('click', function () {
      self.close();
    });
    this.dialog.addEventListener('click', function (event) {
      if (event.target === self.dialog) self.close(); // backdrop
    });
    this.dialog.addEventListener('close', function () {
      document.documentElement.classList.remove('np-qv-open');
    });
    this.q('[data-np-qv-prev]').addEventListener('click', function () {
      self.go(self.slide - 1);
    });
    this.q('[data-np-qv-next]').addEventListener('click', function () {
      self.go(self.slide + 1);
    });
    this.q('[data-np-qv-add]').addEventListener('click', function () {
      self.add();
    });
  };

  QuickView.prototype.variantsFor = function (productGid) {
    var product = this.meta[productGid];
    var allowed = this.bundleVariantIds[productGid];
    if (!allowed || !allowed.length) return product.variants;
    return product.variants.filter(function (v) {
      return allowed.indexOf(String(v.id)) !== -1;
    });
  };

  QuickView.prototype.open = function (productGid, variantGid) {
    this.productGid = productGid;
    this.product = this.meta[productGid];
    this.variants = this.variantsFor(productGid);
    var id = variantGid ? String(variantGid).replace(VARIANT_GID, '') : null;
    this.variant =
      this.variants.find(function (v) {
        return String(v.id) === id;
      }) ||
      this.variants.find(function (v) {
        return v.available;
      }) ||
      this.variants[0];

    this.renderStatic();
    this.renderVariant();

    document.documentElement.classList.add('np-qv-open');
    if (typeof this.dialog.showModal === 'function') {
      this.dialog.showModal();
    } else {
      this.dialog.setAttribute('open', '');
    }
  };

  QuickView.prototype.close = function () {
    if (typeof this.dialog.close === 'function') {
      this.dialog.close();
    } else {
      this.dialog.removeAttribute('open');
    }
    document.documentElement.classList.remove('np-qv-open');
  };

  QuickView.prototype.renderStatic = function () {
    var p = this.product;
    this.q('[data-np-qv-title]').textContent = p.title;

    var ratingWrap = this.q('[data-np-qv-rating]');
    ratingWrap.innerHTML = '';
    var rating = buildRating(p, { className: 'np-qv__stars', href: p.url + '#reviews' });
    if (rating) ratingWrap.appendChild(rating);
    ratingWrap.hidden = !rating;

    this.q('[data-np-qv-desc]').innerHTML = p.description || '';
    this.q('.np-qv__details').hidden = !p.description;

    var self = this;
    var swatches = this.q('[data-np-qv-swatches]');
    swatches.innerHTML = '';
    swatches.hidden = this.variants.length < 2;
    this.variants.forEach(function (v) {
      var btn = el('button', 'np-qv__swatch' + (v.available ? '' : ' is-unavailable'));
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-label', v.title + (v.available ? '' : ' - Sold out'));
      btn.setAttribute('data-variant-id', v.id);
      btn.title = v.title;
      if (v.swatch) {
        var chip = el('span', 'np-qv__swatch-chip');
        chip.style.background = v.swatch;
        btn.appendChild(chip);
      } else {
        btn.classList.add('np-qv__swatch--text');
        btn.textContent = v.title;
      }
      btn.addEventListener('click', function () {
        self.variant = v;
        self.renderVariant();
      });
      swatches.appendChild(btn);
    });
  };

  QuickView.prototype.renderVariant = function () {
    var v = this.variant;
    var p = this.product;
    if (!v) return;

    var prefix = v.collection || p.optionName || '';
    var isDefault = (v.title || '').toLowerCase() === 'default title';
    var label = this.q('[data-np-qv-label]');
    label.textContent = isDefault ? '' : (prefix ? prefix + ': ' : '') + v.title;
    label.hidden = isDefault;

    this.q('[data-np-qv-swatches]')
      .querySelectorAll('.np-qv__swatch')
      .forEach(function (btn) {
        var active = btn.getAttribute('data-variant-id') === String(v.id);
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
      });

    var images = v.images && v.images.length ? v.images.slice() : [];
    if (!images.length) {
      if (v.image) images.push(v.image);
      (p.images || []).forEach(function (src) {
        if (images.indexOf(src) === -1) images.push(src);
      });
    }
    this.images = images;
    this.renderSlides();
    this.go(0);
    this.syncButton();
  };

  QuickView.prototype.renderSlides = function () {
    var wrap = this.q('[data-np-qv-slides]');
    wrap.innerHTML = '';
    var alt = this.product.title + (this.variant ? ' - ' + this.variant.title : '');
    this.images.forEach(function (src, i) {
      var img = el('img', 'np-qv__slide');
      img.src = src;
      img.alt = i === 0 ? alt : '';
      img.loading = i === 0 ? 'eager' : 'lazy';
      wrap.appendChild(img);
    });
    var multiple = this.images.length > 1;
    this.q('[data-np-qv-prev]').hidden = !multiple;
    this.q('[data-np-qv-next]').hidden = !multiple;
  };

  QuickView.prototype.go = function (index) {
    var count = this.images.length;
    if (!count) return;
    this.slide = (index + count) % count;
    var self = this;
    this.q('[data-np-qv-slides]')
      .querySelectorAll('.np-qv__slide')
      .forEach(function (img, i) {
        img.classList.toggle('is-active', i === self.slide);
      });
  };

  QuickView.prototype.findCardButton = function () {
    var variantGid = VARIANT_GID + this.variant.id;
    var card = this.app.querySelector('.pre-product-card[data-pre-variant-id="' + cssEscape(variantGid) + '"]');
    if (card) return card.querySelector('.pre-add-to-bundle-btn');

    card = this.app.querySelector(
      '.pre-product-card[data-pre-product-id="' + cssEscape(this.productGid) + '"]:not([data-pre-variant-id])'
    );
    if (!card) return null;
    var select = card.querySelector('select.pre-variant-selector');
    if (select && select.value !== variantGid) {
      select.value = variantGid;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return card.querySelector('.pre-add-to-bundle-btn');
  };

  QuickView.prototype.syncButton = function () {
    var addBtn = this.q('[data-np-qv-add]');
    var note = this.q('[data-np-qv-note]');
    var cardBtn = this.findCardButton();
    var reason = '';

    if (!this.variant.available) {
      reason = 'Sold out';
    } else if (cardBtn && cardBtn.disabled) {
      reason = (cardBtn.textContent || '').trim();
    }
    addBtn.disabled = !!reason;
    note.textContent = reason;
    note.hidden = !reason;
  };

  QuickView.prototype.add = function () {
    var self = this;
    var btn = this.findCardButton();

    var ready = btn
      ? Promise.resolve(btn)
      : (function () {
          // Card may be on another tab: switch to the first ("All") tab and retry.
          var firstTab = self.app.querySelector('.pre-bundle-tab');
          if (firstTab) firstTab.click();
          return nextFrame().then(function () {
            return self.findCardButton();
          });
        })();

    ready.then(function (button) {
      if (!button || button.disabled) {
        self.syncButton();
        return;
      }
      button.click();
      self.close();
    });
  };

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */

  function initRoot(root) {
    if (root.__npBundleInit) return;
    var app = root.querySelector('pre-mix-and-match');
    if (!app) return;
    root.__npBundleInit = true;

    var meta = readJSON(root.querySelector('[data-np-bundle-meta]')) || {};
    var config = readJSON(root.querySelector('#pre-liquid-bundle-config')) || app.config || null;
    var gridBanners = Array.prototype.slice.call(root.querySelectorAll('template[data-np-grid-banner]'));

    var opts = {
      title: root.getAttribute('data-sidebar-title') || '',
      subtitle: root.getAttribute('data-sidebar-subtitle') || '',
      pill: discountLabel(config),
      labels: {
        items: root.getAttribute('data-label-items') || 'Items:',
        subtotal: root.getAttribute('data-label-subtotal') || '',
        discount: root.getAttribute('data-label-discount') || '',
        total: root.getAttribute('data-label-total') || '',
      },
    };

    if (root.getAttribute('data-quick-view') === 'true') {
      new QuickView(root, app, meta, config);
    }

    // Show every product on one page (no pagination). Presidio treats a
    // non-positive products_per_page as "all"; updateStyleSettings() is the
    // element's own API (used by its admin live preview) and keeps selections.
    var viewMore = {
      step: parseInt(root.getAttribute('data-view-more-step'), 10) || 0,
      label: root.getAttribute('data-view-more-label') || 'View More',
      visible: 0,
      key: null,
    };

    if ((root.getAttribute('data-show-all') === 'true' || viewMore.step > 0) && window.customElements) {
      customElements.whenDefined('pre-mix-and-match').then(function () {
        var settings = app.config && app.config.settings;
        if (!settings || !(settings.products_per_page > 0) || typeof app.updateStyleSettings !== 'function') return;
        var next = {};
        for (var key in settings) next[key] = settings[key];
        next.products_per_page = 0;
        app.updateStyleSettings(next);
      });
    }

    var scheduled = false;
    var run = function () {
      scheduled = false;
      decorateCards(app, meta);
      placeGridBanners(app, gridBanners);
      applyViewMore(app, viewMore);
      decorateSidebar(app, opts);
      root.classList.toggle('np-bundle--ready', !!app.querySelector('.pre-bundle-container'));
    };
    var schedule = function () {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(run);
    };

    new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
    schedule();
  }

  function init() {
    document.querySelectorAll('[data-np-bundle]').forEach(initRoot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', init);
})();
