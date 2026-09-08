/**
 * Bundle Cart Monitor
 * Monitors cart changes to ensure bundle discount is applied/removed correctly
 */

class BundleCartMonitor {
  constructor() {
    this.bundleId = 'silk_bundle';
    this.requiredItems = ['mask', 'pillowcase', 'scrunchie'];
    this.init();
  }

  init() {
    // Monitor cart changes
    this.setupCartChangeListener();
    
    // Initial check on page load
    this.checkBundleIntegrity();
    
    // Monitor cart drawer changes if using Dawn's cart drawer
    this.setupCartDrawerListener();
  }

  setupCartChangeListener() {
    // Listen for cart updates via fetch interceptor
    const originalFetch = window.fetch;
    window.fetch = (...args) => {
      const [resource, config] = args;
      
      // Check if it's a cart-related request
      if (typeof resource === 'string' && (
          resource.includes('/cart/add') ||
          resource.includes('/cart/update') ||
          resource.includes('/cart/change') ||
          resource.includes('/cart/clear')
        )) {
        
        return originalFetch.apply(this, args).then(response => {
          // After cart change, check bundle integrity
          setTimeout(() => this.checkBundleIntegrity(), 500);
          return response;
        });
      }
      
      return originalFetch.apply(this, args);
    };
  }

  setupCartDrawerListener() {
    // Listen for quantity changes in cart drawer
    document.addEventListener('change', (e) => {
      if (e.target.matches('input[name="quantity"]') || 
          e.target.matches('.quantity__input')) {
        setTimeout(() => this.checkBundleIntegrity(), 300);
      }
    });

    // Listen for remove buttons
    document.addEventListener('click', (e) => {
      if (e.target.matches('[name="remove"]') ||
          e.target.closest('[name="remove"]') ||
          e.target.matches('.cart-remove-button') ||
          e.target.closest('.cart-remove-button')) {
        setTimeout(() => this.checkBundleIntegrity(), 500);
      }
    });
  }

  async checkBundleIntegrity() {
    try {
      const cartData = await this.getCartData();
      const bundleItems = this.getBundleItems(cartData);
      
      if (this.isBundleComplete(bundleItems)) {
        // Bundle is complete, discount should be applied
        console.log('Bundle is complete, discount should be applied');
      } else if (this.hasBundleItems(bundleItems)) {
        // Partial bundle - remove discount and bundle attributes
        await this.cleanupIncompleteBundle(cartData, bundleItems);
      }
    } catch (error) {
      console.error('Error checking bundle integrity:', error);
    }
  }

  async getCartData() {
    const response = await fetch('/cart.json');
    return await response.json();
  }

  getBundleItems(cartData) {
    return cartData.items.filter(item => 
      item.properties && item.properties._bundled === this.bundleId
    );
  }

  isBundleComplete(bundleItems) {
    const itemTypes = bundleItems.map(item => 
      item.properties && item.properties._bundle_item
    );
    
    return this.requiredItems.every(requiredItem => 
      itemTypes.includes(requiredItem)
    ) && bundleItems.length === this.requiredItems.length;
  }

  hasBundleItems(bundleItems) {
    return bundleItems.length > 0;
  }

  async cleanupIncompleteBundle(cartData, bundleItems) {
    console.log('Cleaning up incomplete bundle...');
    
    // Remove bundle properties from remaining items
    const updates = {};
    
    for (const item of bundleItems) {
      const key = item.key;
      updates[key] = {
        quantity: item.quantity,
        properties: this.removeBundleProperties(item.properties)
      };
    }

    // Update cart to remove bundle attributes
    try {
      await fetch('/cart/update.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates })
      });
      
      console.log('Bundle properties removed from incomplete bundle items');
    } catch (error) {
      console.error('Error removing bundle properties:', error);
    }
  }

  removeBundleProperties(properties) {
    if (!properties) return {};
    
    const cleanedProperties = { ...properties };
    delete cleanedProperties._bundled;
    delete cleanedProperties._bundle_item;
    delete cleanedProperties._bundle_title;
    
    return cleanedProperties;
  }

  // Public method to validate bundle before adding to cart
  static async validateBundleBeforeAdd(items) {
    const requiredItems = ['mask', 'pillowcase', 'scrunchie'];
    const itemTypes = items.map(item => 
      item.properties && item.properties._bundle_item
    );
    
    if (!requiredItems.every(requiredItem => itemTypes.includes(requiredItem))) {
      throw new Error('Bundle must contain all required items: mask, pillowcase, and scrunchie');
    }
    
    if (items.length !== requiredItems.length) {
      throw new Error('Bundle contains incorrect number of items');
    }
    
    return true;
  }
}

// Initialize the monitor when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BundleCartMonitor();
});

// Export for use in bundle product form
window.BundleCartMonitor = BundleCartMonitor;