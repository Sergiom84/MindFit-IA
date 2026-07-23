/**
 * Storage Manager Utility
 * Handles localStorage operations with error handling and corruption protection
 */

import logger from './logger';

class StorageManager {
  constructor() {
    this.cache = new Map();
    this.isAvailable = this.checkAvailability();
  }

  /**
   * Check if localStorage is available
   * @returns {boolean} True if available
   */
  checkAvailability() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      logger.error('localStorage not available', e, 'StorageManager');
      return false;
    }
  }

  /**
   * Get item from storage with fallback
   * @param {string} key - Storage key
   * @param {any} defaultValue - Default value if not found or corrupted
   * @returns {any} Stored value or default
   */
  getItem(key, defaultValue = null) {
    try {
      // Check cache first
      if (this.cache.has(key)) {
        return this.cache.get(key);
      }

      // If localStorage not available, return default
      if (!this.isAvailable) {
        return defaultValue;
      }

      const item = localStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }

      // Try to parse JSON
      try {
        const parsed = JSON.parse(item);
        this.cache.set(key, parsed);
        return parsed;
      } catch {
        // Not JSON, return as string
        this.cache.set(key, item);
        return item;
      }
    } catch (error) {
      logger.error(`Failed to get item: ${key}`, error, 'StorageManager');
      return defaultValue;
    }
  }

  /**
   * Set item in storage
   * @param {string} key - Storage key
   * @param {any} value - Value to store
   * @returns {boolean} True if successful
   */
  setItem(key, value) {
    try {
      if (!this.isAvailable) {
        logger.warn('localStorage not available, using cache only', null, 'StorageManager');
        this.cache.set(key, value);
        return false;
      }

      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, serialized);
      this.cache.set(key, value);

      return true;
    } catch (error) {
      // Handle quota exceeded
      if (error.name === 'QuotaExceededError') {
        logger.error('localStorage quota exceeded', error, 'StorageManager');
        this.handleQuotaExceeded();
      } else {
        logger.error(`Failed to set item: ${key}`, error, 'StorageManager');
      }

      // Store in cache as fallback
      this.cache.set(key, value);
      return false;
    }
  }

  /**
   * Remove item from storage
   * @param {string} key - Storage key
   * @returns {boolean} True if successful
   */
  removeItem(key) {
    try {
      this.cache.delete(key);

      if (!this.isAvailable) {
        return false;
      }

      localStorage.removeItem(key);
      return true;
    } catch (error) {
      logger.error(`Failed to remove item: ${key}`, error, 'StorageManager');
      return false;
    }
  }

  /**
   * Clear all items or specific pattern
   * @param {string|RegExp} pattern - Optional pattern to match keys
   * @returns {boolean} True if successful
   */
  clear(pattern = null) {
    try {
      if (pattern) {
        const keys = this.getKeys();
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);

        keys.forEach(key => {
          if (regex.test(key)) {
            this.removeItem(key);
          }
        });
      } else {
        this.cache.clear();

        if (this.isAvailable) {
          localStorage.clear();
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to clear storage', error, 'StorageManager');
      return false;
    }
  }

  /**
   * Get all keys
   * @returns {string[]} Array of keys
   */
  getKeys() {
    try {
      if (!this.isAvailable) {
        return Array.from(this.cache.keys());
      }

      return Object.keys(localStorage);
    } catch (error) {
      logger.error('Failed to get keys', error, 'StorageManager');
      return [];
    }
  }

  /**
   * Get storage size
   * @returns {object} Size information
   */
  getSize() {
    try {
      let totalSize = 0;
      const keys = this.getKeys();

      keys.forEach(key => {
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += key.length + value.length;
        }
      });

      // Estimate max size (usually 5-10MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      const percentUsed = (totalSize / maxSize) * 100;

      return {
        used: totalSize,
        max: maxSize,
        percentUsed: percentUsed.toFixed(2),
        itemCount: keys.length
      };
    } catch (error) {
      logger.error('Failed to get storage size', error, 'StorageManager');
      return { used: 0, max: 0, percentUsed: 0, itemCount: 0 };
    }
  }

  /**
   * Handle quota exceeded error
   */
  handleQuotaExceeded() {
    try {
      // Clear old/temporary data first
      const tempKeys = this.getKeys().filter(key =>
        key.includes('temp') ||
        key.includes('cache') ||
        key.includes('_old')
      );

      tempKeys.forEach(key => this.removeItem(key));

      // If still not enough, clear oldest items
      const items = [];
      this.getKeys().forEach(key => {
        const value = localStorage.getItem(key);
        items.push({ key, size: (key.length + value.length) });
      });

      // Sort by size and remove largest non-essential items
      items.sort((a, b) => b.size - a.size);

      const essentialKeys = ['accessToken', 'refreshToken', 'userData', 'sessionId'];
      const toRemove = items.filter(item => !essentialKeys.includes(item.key));

      // Remove 20% of largest items
      const removeCount = Math.ceil(toRemove.length * 0.2);
      toRemove.slice(0, removeCount).forEach(item => {
        this.removeItem(item.key);
      });

      logger.info(`Cleared ${removeCount} items to free space`, null, 'StorageManager');
    } catch (error) {
      logger.error('Failed to handle quota exceeded', error, 'StorageManager');
    }
  }

  /**
   * Migrate old keys to new format
   * @param {object} keyMap - Map of old keys to new keys
   */
  migrateKeys(keyMap) {
    try {
      Object.entries(keyMap).forEach(([oldKey, newKey]) => {
        const value = this.getItem(oldKey);
        if (value !== null) {
          this.setItem(newKey, value);
          this.removeItem(oldKey);
          logger.info(`Migrated ${oldKey} to ${newKey}`, null, 'StorageManager');
        }
      });
    } catch (error) {
      logger.error('Failed to migrate keys', error, 'StorageManager');
    }
  }

  /**
   * Validate and repair storage
   * @returns {object} Validation result
   */
  validateAndRepair() {
    const result = {
      errors: [],
      repaired: [],
      removed: []
    };

    try {
      const keys = this.getKeys();

      keys.forEach(key => {
        try {
          const value = localStorage.getItem(key);

          // Check for null or undefined
          if (value === null || value === 'undefined') {
            this.removeItem(key);
            result.removed.push(key);
            return;
          }

          // Try to parse JSON values
          if (value.startsWith('{') || value.startsWith('[')) {
            try {
              JSON.parse(value);
            } catch {
              // Corrupted JSON, try to repair or remove
              logger.warn(`Corrupted JSON in ${key}`, null, 'StorageManager');
              this.removeItem(key);
              result.removed.push(key);
            }
          }
        } catch (error) {
          result.errors.push({ key, error: error.message });
        }
      });

      logger.info('Storage validation complete', result, 'StorageManager');
    } catch (error) {
      logger.error('Storage validation failed', error, 'StorageManager');
    }

    return result;
  }

  /**
   * Create backup of storage
   * @returns {object} Backup data
   */
  createBackup() {
    try {
      const backup = {};
      const keys = this.getKeys();

      keys.forEach(key => {
        backup[key] = this.getItem(key);
      });

      return {
        timestamp: Date.now(),
        data: backup,
        itemCount: keys.length
      };
    } catch (error) {
      logger.error('Failed to create backup', error, 'StorageManager');
      return null;
    }
  }

  /**
   * Restore from backup
   * @param {object} backup - Backup data
   * @returns {boolean} True if successful
   */
  restoreBackup(backup) {
    try {
      if (!backup || !backup.data) {
        logger.error('Invalid backup data', null, 'StorageManager');
        return false;
      }

      // Clear existing data
      this.clear();

      // Restore each item
      Object.entries(backup.data).forEach(([key, value]) => {
        this.setItem(key, value);
      });

      logger.info('Backup restored', { itemCount: Object.keys(backup.data).length }, 'StorageManager');
      return true;
    } catch (error) {
      logger.error('Failed to restore backup', error, 'StorageManager');
      return false;
    }
  }

  /**
   * Watch for storage changes
   * @param {function} callback - Callback for changes
   */
  watchChanges(callback) {
    window.addEventListener('storage', (e) => {
      if (e.storageArea === localStorage) {
        callback({
          key: e.key,
          oldValue: e.oldValue,
          newValue: e.newValue,
          url: e.url
        });
      }
    });
  }
}

// Export singleton instance
export default new StorageManager();