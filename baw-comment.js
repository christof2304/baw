/**
 * BAW Cesium Viewer - Comments System
 * Version: 2.1.0 - IMPROVED
 * 
 * Improvements:
 * - JSDoc documentation added
 * - Better error handling throughout
 * - Optimized DOM manipulation with DocumentFragment
 * - Memory leak prevention (proper cleanup)
 * - Consistent naming conventions
 * - Hardcoded strings replaced with constants
 */

// ===========================
// LocalCommentsAPI Class
// ===========================
/**
 * Handles local storage and management of comments
 */
class LocalCommentsAPI {
  constructor() {
    this.storageKey = BAWUtils.constants.STORAGE_KEY_COMMENTS;
    this.data = this.loadFromStorage();
    this._cache = new Map();
    this._maxCacheSize = BAWUtils.constants.CACHE_MAX_SIZE;
  }

  /**
   * Load comments data from localStorage
   * @returns {Object} Comments data object
   */
  loadFromStorage() {
    return BAWUtils.utils.safeExecute(() => {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : this.getDefaultData();
    }, BAWUtils.messages.ERROR_LOADING, this.getDefaultData());
  }

  /**
   * Get default empty data structure
   * @returns {Object} Default data object
   */
  getDefaultData() {
    return { 
      comments: {}, 
      metadata: { version: BAWUtils.constants.STORAGE_VERSION } 
    };
  }

  /**
   * Save comments data to localStorage
   * @returns {boolean} Success status
   */
  saveToStorage() {
    return BAWUtils.utils.safeExecute(() => {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      this._cache.clear(); // Clear cache on save
      return true;
    }, BAWUtils.messages.ERROR_STORAGE, false);
  }

  /**
   * Load comments for a specific scene
   * @param {string} sceneName - Name of the scene
   * @returns {Array<Object>} Array of comment objects with Cesium positions
   */
  loadComments(sceneName) {
    if (!sceneName) {
      console.warn('No scene name provided to loadComments');
      return [];
    }

    // Check cache first
    if (this._cache.has(sceneName)) {
      return this._cache.get(sceneName);
    }

    const comments = BAWUtils.utils.safeExecute(() => {
      return (this.data.comments[sceneName] || []).map(comment => ({
        ...comment,
        position: new Cesium.Cartesian3(
          comment.position_x,
          comment.position_y,
          comment.position_z
        )
      }));
    }, `Error loading comments for scene: ${sceneName}`, []);

    // Cache with size limit
    if (this._cache.size >= this._maxCacheSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }
    this._cache.set(sceneName, comments);
    
    return comments;
  }

  /**
   * Save a new comment
   * @param {string} sceneName - Name of the scene
   * @param {string} commentText - Comment text
   * @param {Cesium.Cartesian3} position - 3D position
   * @param {string|null} featureName - Optional feature name
   * @param {string} userName - User name
   * @returns {Object|null} Saved comment object or null on error
   */
  saveComment(sceneName, commentText, position, featureName, userName) {
    return BAWUtils.utils.safeExecute(() => {
      if (!this.data.comments[sceneName]) {
        this.data.comments[sceneName] = [];
      }

      const newComment = {
        id: BAWUtils.utils.generateId(),
        text: commentText,
        position_x: position.x,
        position_y: position.y,
        position_z: position.z,
        featureName: featureName || null,
        timestamp: new Date().toISOString(),
        user: userName,
        szene: sceneName
      };

      this.data.comments[sceneName].push(newComment);
      this.saveToStorage();

      return { ...newComment, position };
    }, 'Error saving comment', null);
  }

  /**
   * Update an existing comment
   * @param {string} commentId - Comment ID
   * @param {string} newText - New comment text
   * @param {string} sceneName - Scene name
   * @returns {boolean} Success status
   * @throws {Error} If scene or comment not found
   */
  updateComment(commentId, newText, sceneName) {
    return BAWUtils.utils.safeExecute(() => {
      const comments = this.data.comments[sceneName];
      if (!comments) throw new Error(BAWUtils.messages.ERROR_SCENE_NOT_FOUND);

      const comment = comments.find(c => c.id === commentId);
      if (!comment) throw new Error(BAWUtils.messages.ERROR_COMMENT_NOT_FOUND);

      comment.text = newText;
      comment.timestamp = new Date().toISOString();
      
      this.saveToStorage();
      return true;
    }, 'Error updating comment', false);
  }

  /**
   * Delete a comment
   * @param {string} commentId - Comment ID
   * @param {string} sceneName - Scene name
   * @returns {boolean} Success status
   * @throws {Error} If scene not found
   */
  deleteComment(commentId, sceneName) {
    return BAWUtils.utils.safeExecute(() => {
      if (!this.data.comments[sceneName]) {
        throw new Error(BAWUtils.messages.ERROR_SCENE_NOT_FOUND);
      }

      const originalLength = this.data.comments[sceneName].length;
      this.data.comments[sceneName] = this.data.comments[sceneName].filter(
        c => c.id !== commentId
      );
      
      const deleted = this.data.comments[sceneName].length < originalLength;
      if (deleted) {
        this.saveToStorage();
      }
      
      return deleted;
    }, 'Error deleting comment', false);
  }

  /**
   * Export comments as JSON
   * @returns {string} JSON string
   */
  exportJSON() {
    return BAWUtils.utils.safeExecute(
      () => JSON.stringify(this.data, null, 2),
      'Error exporting JSON',
      '{}'
    );
  }

  /**
   * Export comments as CSV
   * @returns {string} CSV string
   */
  exportCSV() {
    return BAWUtils.utils.safeExecute(() => {
      const headers = [
        'Szene', 'Kommentar', 'Position_X', 'Position_Y', 'Position_Z', 
        'Feature', 'Datum', 'ID', 'Benutzer'
      ];
      const rows = [headers.join(',')];

      Object.entries(this.data.comments).forEach(([sceneName, comments]) => {
        comments.forEach(comment => {
          const row = [
            `"${this._escapeCsvValue(sceneName)}"`,
            `"${this._escapeCsvValue(comment.text)}"`,
            comment.position_x.toFixed(6),
            comment.position_y.toFixed(6),
            comment.position_z.toFixed(6),
            `"${this._escapeCsvValue(comment.featureName || '')}"`,
            `"${comment.timestamp}"`,
            `"${comment.id}"`,
            `"${this._escapeCsvValue(comment.user)}"`
          ];
          rows.push(row.join(','));
        });
      });

      return rows.join('\n');
    }, 'Error exporting CSV', 'Error');
  }

  /**
   * Escape CSV value by doubling quotes
   * @param {string} value - Value to escape
   * @returns {string} Escaped value
   * @private
   */
  _escapeCsvValue(value) {
    return String(value).replace(/"/g, '""');
  }

  /**
   * Import data from JSON
   * @param {string} jsonData - JSON string
   * @returns {boolean} Success status
   * @throws {Error} If data structure is invalid
   */
  importData(jsonData) {
    return BAWUtils.utils.safeExecute(() => {
      const parsed = JSON.parse(jsonData);
      
      if (!parsed.comments || typeof parsed.comments !== 'object') {
        throw new Error(BAWUtils.messages.ERROR_INVALID_JSON);
      }

      this.data = parsed;
      this.saveToStorage();
      this._cache.clear();
      return true;
    }, BAWUtils.messages.ERROR_FILE_IMPORT, false);
  }

  /**
   * Import data from CSV
   * @param {string} csvData - CSV string
   * @returns {boolean} Success status
   * @throws {Error} If CSV format is invalid
   */
  importCSV(csvData) {
    return BAWUtils.utils.safeExecute(() => {
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        throw new Error('CSV must have at least a header and one data row');
      }

      this.data.comments = {};
      
      for (let i = 1; i < lines.length; i++) {
        const values = this._parseCSVLine(lines[i]);
        if (values.length >= 9) {
          const sceneName = values[0];
          if (!this.data.comments[sceneName]) {
            this.data.comments[sceneName] = [];
          }
          
          this.data.comments[sceneName].push({
            text: values[1],
            position_x: parseFloat(values[2]),
            position_y: parseFloat(values[3]),
            position_z: parseFloat(values[4]),
            featureName: values[5] || null,
            timestamp: values[6],
            id: values[7],
            user: values[8],
            szene: sceneName
          });
        }
      }
      
      this.saveToStorage();
      this._cache.clear();
      return true;
    }, BAWUtils.messages.ERROR_FILE_IMPORT, false);
  }

  /**
   * Parse a single CSV line with quote handling
   * @param {string} line - CSV line
   * @returns {Array<string>} Parsed values
   * @private
   */
  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  }

  /**
   * Clear all comment data
   */
  clearAllData() {
    this.data = this.getDefaultData();
    this._cache.clear();
    this.saveToStorage();
  }

  /**
   * Get statistics about stored comments
   * @returns {Object} Statistics object
   */
  getStats() {
    let totalComments = 0;
    const scenes = Object.keys(this.data.comments);
    
    scenes.forEach(scene => {
      totalComments += this.data.comments[scene].length;
    });
    
    return { 
      totalComments, 
      scenes: scenes.length, 
      scenesWithComments: scenes 
    };
  }
}

// ===========================
// Comments Manager Class
// ===========================
/**
 * Manages comment visualization and user interactions
 */
class CommentsManager {
  constructor() {
    this.api = new LocalCommentsAPI();
    this.isCommentMode = false;
    this.currentEditId = null;
    this.pendingPosition = null;
    this.pendingFeature = null;
    this.currentSceneComments = [];
    this.billboards = null;
    this.labels = null;
    this.cachedCommentIcon = null;
    this.viewer = null;
    this.currentGroup = null;
    this.userName = '';
    
    // For cleanup tracking
    this._eventHandlers = [];
    this._primitives = [];
  }

  /**
   * Initialize the comments system
   * @param {Cesium.Viewer} viewer - Cesium viewer instance
   */
  init(viewer) {
    if (!viewer) {
      console.error('Cannot initialize comments: viewer is null');
      return;
    }

    this.viewer = viewer;
    console.log("💬 Initializing comments system...");
    
    try {
      this.billboards = new Cesium.BillboardCollection();
      this.labels = new Cesium.LabelCollection();
      
      this._primitives.push(
        this.viewer.scene.primitives.add(this.billboards),
        this.viewer.scene.primitives.add(this.labels)
      );
      
      console.log("✅ Comments system ready");
    } catch (error) {
      console.error('Error initializing comments system:', error);
      BAWUtils.ui.showToast(
        BAWUtils.messages.ERROR_LOADING,
        'error',
        BAWUtils.constants.TOAST_ERROR_DURATION_MS
      );
    }
  }

  /**
   * Set the current scene group
   * @param {Object} group - Scene group object
   */
  setCurrentGroup(group) {
    this.currentGroup = group;
  }

  /**
   * Set the current user name
   * @param {string} userName - User name
   */
  setUserName(userName) {
    this.userName = userName ? userName.trim() : '';
  }

  /**
   * Toggle comment mode on/off
   */
  toggleCommentMode() {
    if (this.isCommentMode) {
      this.exitCommentMode();
    } else {
      this.enterCommentMode();
    }
  }

  /**
   * Enter comment mode
   */
  enterCommentMode() {
    if (!this.userName) {
      BAWUtils.ui.showToast(BAWUtils.messages.COMMENT_NO_NAME, "warning");
      const userNameInput = BAWUtils.utils.getElement('userName');
      if (userNameInput) userNameInput.focus();
      return;
    }
    
    if (!this.currentGroup) {
      BAWUtils.ui.showToast("Bitte laden Sie zuerst eine Szene", "warning");
      return;
    }
    
    this.isCommentMode = true;
    this.updateCommentModeUI();
    
    const indicator = BAWUtils.utils.getElement('commentModeIndicator');
    if (indicator) indicator.style.display = 'block';
    
    BAWUtils.ui.showToast(
      "Kommentar-Modus aktiviert. Klicken Sie auf die Karte.", 
      "success"
    );
  }

  /**
   * Exit comment mode
   */
  exitCommentMode() {
    this.isCommentMode = false;
    this.pendingPosition = null;
    this.pendingFeature = null;
    this.updateCommentModeUI();
    
    const indicator = BAWUtils.utils.getElement('commentModeIndicator');
    if (indicator) indicator.style.display = 'none';
  }

  /**
   * Handle click in comment mode
   * @param {Object} click - Cesium click event
   */
  handleCommentModeClick(click) {
    BAWUtils.utils.safeExecute(() => {
      const pickedFeature = this.viewer.scene.pick(click.position);
      let cartesian = null;
      let featureName = null;
      
      if (pickedFeature instanceof Cesium.Cesium3DTileFeature) {
        cartesian = this._getPickedPosition(click.position);
        featureName = this._getFeatureName(pickedFeature);
      } else {
        cartesian = this.viewer.camera.pickEllipsoid(
          click.position, 
          this.viewer.scene.globe.ellipsoid
        );
      }
      
      if (cartesian) {
        this.pendingPosition = cartesian;
        this.pendingFeature = featureName;
        
        const commentInput = BAWUtils.utils.getElement('commentInput');
        if (commentInput) {
          commentInput.focus();
        }
        
        BAWUtils.ui.showToast(
          "Position ausgewählt. Geben Sie einen Kommentar ein.", 
          "success"
        );
      }
    }, 'Error handling comment mode click');
  }

  /**
   * Get picked position safely
   * @param {Cesium.Cartesian2} position - Screen position
   * @returns {Cesium.Cartesian3|null} World position
   * @private
   */
  _getPickedPosition(position) {
    return BAWUtils.utils.safeExecute(() => {
      const pos = this.viewer.scene.pickPosition(position);
      if (pos) return pos;
      
      return this.viewer.camera.pickEllipsoid(
        position, 
        this.viewer.scene.globe.ellipsoid
      );
    }, 'Error getting picked position', null);
  }

  /**
   * Get feature name from picked feature
   * @param {Cesium.Cesium3DTileFeature} feature - Picked feature
   * @returns {string|null} Feature name
   * @private
   */
  _getFeatureName(feature) {
    return BAWUtils.utils.safeExecute(() => {
      const props = feature.getPropertyIds();
      if (props.includes('Objektart')) {
        return feature.getProperty('Objektart');
      }
      if (props.includes('Name')) {
        return feature.getProperty('Name');
      }
      return null;
    }, 'Error getting feature name', null);
  }

  /**
   * Add a new comment
   */
  addComment() {
    const commentInput = BAWUtils.utils.getElement('commentInput');
    if (!commentInput) return;

    const commentText = commentInput.value.trim();
    
    if (!commentText) {
      BAWUtils.ui.showToast(BAWUtils.messages.COMMENT_NO_TEXT, "warning");
      return;
    }
    
    if (!this.pendingPosition) {
      BAWUtils.ui.showToast("Bitte klicken Sie zuerst auf die Karte", "warning");
      return;
    }
    
    const success = BAWUtils.utils.safeExecute(() => {
      const savedComment = this.api.saveComment(
        this.currentGroup.name,
        commentText,
        this.pendingPosition,
        this.pendingFeature,
        this.userName
      );
      
      if (savedComment) {
        this.currentSceneComments.push(savedComment);
        this.addCommentVisual(savedComment, this.currentSceneComments.length - 1);
        this.updateCommentsDisplay();
        this.updateDataStatus();
        
        commentInput.value = '';
        this.pendingPosition = null;
        this.pendingFeature = null;
        
        BAWUtils.ui.showToast(BAWUtils.messages.COMMENT_SAVED, "success");
        
        if (this.viewer.scene.requestRenderMode) {
          this.viewer.scene.requestRender();
        }
        
        return true;
      }
      return false;
    }, 'Error adding comment', false);

    if (!success) {
      BAWUtils.ui.showToast(
        'Fehler beim Speichern des Kommentars', 
        'error',
        BAWUtils.constants.TOAST_ERROR_DURATION_MS
      );
    }
  }

  /**
   * Cancel current comment
   */
  cancelComment() {
    const commentInput = BAWUtils.utils.getElement('commentInput');
    if (commentInput) {
      commentInput.value = '';
    }
    this.pendingPosition = null;
    this.pendingFeature = null;
    BAWUtils.ui.showToast("Kommentar abgebrochen", "info");
  }

  /**
   * Load comments for current scene
   */
  loadSceneComments() {
    BAWUtils.utils.safeExecute(() => {
      if (!this.currentGroup) {
        this.currentSceneComments = [];
        return;
      }
      
      this.currentSceneComments = this.api.loadComments(this.currentGroup.name);
      this.refreshCommentVisuals();
      this.updateCommentsDisplay();
      this.updateDataStatus();
      
      if (this.viewer && this.viewer.scene.requestRenderMode) {
        this.viewer.scene.requestRender();
      }
    }, 'Error loading scene comments');
  }

  /**
   * Refresh all comment visuals
   */
  refreshCommentVisuals() {
    if (!this.billboards || !this.labels) return;

    BAWUtils.utils.safeExecute(() => {
      this.billboards.removeAll();
      this.labels.removeAll();
      
      this.currentSceneComments.forEach((comment, index) => {
        this.addCommentVisual(comment, index);
      });
    }, 'Error refreshing comment visuals');
  }

  /**
   * Create comment icon canvas (cached)
   * @returns {HTMLCanvasElement} Canvas with comment icon
   * @private
   */
  _createCommentIcon() {
    const canvas = document.createElement('canvas');
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return canvas;

    // Circle background
    ctx.fillStyle = '#4FC3F7';
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, 2 * Math.PI);
    ctx.fill();
    
    // White border
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Emoji text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💬', size/2, size/2);
    
    return canvas;
  }

  /**
   * Add visual representation of a comment
   * @param {Object} comment - Comment object
   * @param {number} index - Comment index
   */
  addCommentVisual(comment, index) {
    BAWUtils.utils.safeExecute(() => {
      if (!this.cachedCommentIcon) {
        this.cachedCommentIcon = this._createCommentIcon();
      }
      
      this.billboards.add({
        position: comment.position,
        image: this.cachedCommentIcon,
        scale: 1.0,
        pixelOffset: new Cesium.Cartesian2(0, -16),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.NONE,
        id: `comment_${comment.id}`
      });
      
      const previewText = comment.text.length > 30 
        ? comment.text.substring(0, 30) + '...' 
        : comment.text;
      
      this.labels.add({
        position: comment.position,
        text: previewText,
        font: '12px Arial',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        pixelOffset: new Cesium.Cartesian2(0, 20),
        scale: 0.8,
        heightReference: Cesium.HeightReference.NONE,
        id: `comment_label_${comment.id}`,
        show: false
      });
    }, 'Error adding comment visual');
  }

  /**
   * Update comments display in UI - OPTIMIZED with DocumentFragment
   */
  updateCommentsDisplay() {
    const commentsList = BAWUtils.utils.getElement('commentsList');
    if (!commentsList) return;
    
    BAWUtils.utils.safeExecute(() => {
      if (this.currentSceneComments.length === 0) {
        commentsList.innerHTML = `
          <div class="no-comments">
            ${BAWUtils.messages.INFO_NO_COMMENTS}<br>
            <small>Aktivieren Sie den Hinzufügen-Modus und klicken Sie auf die Karte.</small>
          </div>
        `;
        return;
      }
      
      const sortedComments = [...this.currentSceneComments].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
      
      // Use DocumentFragment for optimal performance
      const fragment = document.createDocumentFragment();
      const container = document.createElement('div');
      
      sortedComments.forEach(comment => {
        const commentDiv = this._createCommentElement(comment);
        container.appendChild(commentDiv);
      });
      
      // Attach event handlers using delegation (single listener)
      container.addEventListener('click', this._handleCommentAction.bind(this));
      
      fragment.appendChild(container);
      commentsList.innerHTML = '';
      commentsList.appendChild(fragment);
    }, 'Error updating comments display');
  }

  /**
   * Create a single comment DOM element
   * @param {Object} comment - Comment object
   * @returns {HTMLElement} Comment div element
   * @private
   */
  _createCommentElement(comment) {
    const commentDiv = document.createElement('div');
    commentDiv.className = 'comment-item';
    commentDiv.dataset.commentId = comment.id;
    
    const formattedDate = BAWUtils.utils.formatDate(comment.timestamp);
    
    commentDiv.innerHTML = `
      <div class="comment-header">
        <div class="comment-info">${formattedDate}</div>
        <div class="comment-actions">
          <button class="btn btn-ghost btn-small" data-action="zoom" data-id="${comment.id}" aria-label="Zu Kommentar zoomen">👁️</button>
          <button class="btn btn-ghost btn-small" data-action="edit" data-id="${comment.id}" aria-label="Kommentar bearbeiten">✏️</button>
          <button class="btn btn-danger btn-small" data-action="delete" data-id="${comment.id}" aria-label="Kommentar löschen">🗑️</button>
        </div>
      </div>
      <div class="comment-text">${this._escapeHtml(comment.text)}</div>
      ${comment.featureName ? `<div class="comment-feature">📍 ${this._escapeHtml(comment.featureName)}</div>` : ''}
      <div class="comment-user">👤 ${this._escapeHtml(comment.user || 'Unbekannt')}</div>
      <div class="comment-location">
        ${comment.position.x.toFixed(1)}, ${comment.position.y.toFixed(1)}, ${comment.position.z.toFixed(1)}
      </div>
    `;
    
    return commentDiv;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   * @private
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Handle comment action clicks (delegated)
   * @param {Event} e - Click event
   * @private
   */
  _handleCommentAction(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    
    const action = button.dataset.action;
    const id = button.dataset.id;
    
    switch (action) {
      case 'zoom':
        this.zoomToComment(id);
        break;
      case 'edit':
        this.openEditComment(id);
        break;
      case 'delete':
        this.deleteComment(id);
        break;
    }
  }

  /**
   * Update comment mode UI elements
   */
  updateCommentModeUI() {
    const elements = {
      modeText: BAWUtils.utils.getElement('commentModeText'),
      toggleBtn: BAWUtils.utils.getElement('toggleCommentMode'),
      commentInput: BAWUtils.utils.getElement('commentInput'),
      addBtn: BAWUtils.utils.getElement('addCommentBtn'),
      cancelBtn: BAWUtils.utils.getElement('cancelCommentBtn')
    };
    
    const sceneLoaded = this.currentGroup !== null;
    
    if (!sceneLoaded) {
      if (elements.modeText) {
        elements.modeText.textContent = 'Laden Sie zuerst eine Szene';
      }
      if (elements.toggleBtn) {
        elements.toggleBtn.textContent = '✏️ Hinzufügen';
        elements.toggleBtn.className = 'btn btn-primary btn-small';
        elements.toggleBtn.disabled = true;
      }
      ['commentInput', 'addBtn', 'cancelBtn'].forEach(key => {
        if (elements[key]) elements[key].disabled = true;
      });
      return;
    }
    
    if (elements.toggleBtn) elements.toggleBtn.disabled = false;
    
    if (this.isCommentMode) {
      if (elements.modeText) {
        elements.modeText.textContent = BAWUtils.messages.COMMENT_MODE_ACTIVE_SHORT;
      }
      if (elements.toggleBtn) {
        elements.toggleBtn.textContent = '❌ Stoppen';
        elements.toggleBtn.className = 'btn btn-danger btn-small';
      }
      ['commentInput', 'addBtn', 'cancelBtn'].forEach(key => {
        if (elements[key]) elements[key].disabled = false;
      });
    } else {
      if (elements.modeText) {
        elements.modeText.textContent = BAWUtils.messages.COMMENT_MODE_INACTIVE;
      }
      if (elements.toggleBtn) {
        elements.toggleBtn.textContent = '✏️ Hinzufügen';
        elements.toggleBtn.className = 'btn btn-primary btn-small';
      }
      ['commentInput', 'addBtn', 'cancelBtn'].forEach(key => {
        if (elements[key]) elements[key].disabled = true;
      });
    }
  }

  /**
   * Open edit dialog for a comment
   * @param {string} commentId - Comment ID
   */
  openEditComment(commentId) {
    const comment = this.currentSceneComments.find(c => c.id === commentId);
    if (!comment) {
      BAWUtils.ui.showToast(BAWUtils.messages.ERROR_COMMENT_NOT_FOUND, 'error');
      return;
    }
    
    this.currentEditId = commentId;
    
    const editInput = BAWUtils.utils.getElement('commentEditInput');
    const overlay = BAWUtils.utils.getElement('commentEditOverlay');
    
    if (editInput) editInput.value = comment.text;
    if (overlay) overlay.style.display = 'flex';
  }

  /**
   * Save edited comment
   */
  saveEditComment() {
    if (!this.currentEditId) return;
    
    const editInput = BAWUtils.utils.getElement('commentEditInput');
    if (!editInput) return;
    
    const newText = editInput.value.trim();
    if (!newText) {
      BAWUtils.ui.showToast(BAWUtils.messages.COMMENT_NO_TEXT, "warning");
      return;
    }
    
    const success = this.api.updateComment(
      this.currentEditId, 
      newText, 
      this.currentGroup.name
    );
    
    if (success) {
      const comment = this.currentSceneComments.find(c => c.id === this.currentEditId);
      if (comment) {
        comment.text = newText;
        comment.timestamp = new Date().toISOString();
      }
      
      this.updateCommentsDisplay();
      this.closeEditComment();
      BAWUtils.ui.showToast(BAWUtils.messages.COMMENT_UPDATED, "success");
    } else {
      BAWUtils.ui.showToast(
        'Fehler beim Aktualisieren des Kommentars', 
        'error',
        BAWUtils.constants.TOAST_ERROR_DURATION_MS
      );
    }
  }

  /**
   * Close edit dialog
   */
  closeEditComment() {
    const overlay = BAWUtils.utils.getElement('commentEditOverlay');
    if (overlay) overlay.style.display = 'none';
    this.currentEditId = null;
  }

  /**
   * Delete a comment
   * @param {string} commentId - Comment ID
   */
  deleteComment(commentId) {
    if (!confirm(BAWUtils.messages.COMMENT_DELETE_CONFIRM)) {
      return;
    }
    
    const success = this.api.deleteComment(commentId, this.currentGroup.name);
    
    if (success) {
      this.currentSceneComments = this.currentSceneComments.filter(
        c => c.id !== commentId
      );
      this.refreshCommentVisuals();
      this.updateCommentsDisplay();
      this.updateDataStatus();
      BAWUtils.ui.showToast(BAWUtils.messages.COMMENT_DELETED, "success");
      
      if (this.viewer && this.viewer.scene.requestRenderMode) {
        this.viewer.scene.requestRender();
      }
    } else {
      BAWUtils.ui.showToast(
        'Fehler beim Löschen des Kommentars', 
        'error',
        BAWUtils.constants.TOAST_ERROR_DURATION_MS
      );
    }
  }

  /**
   * Zoom camera to a comment
   * @param {string} commentId - Comment ID
   */
  zoomToComment(commentId) {
    const comment = this.currentSceneComments.find(c => c.id === commentId);
    if (!comment || !this.viewer) return;
    
    BAWUtils.utils.safeExecute(() => {
      this.viewer.camera.flyTo({
        destination: comment.position,
        offset: new Cesium.HeadingPitchRange(0, -0.5, 50),
        duration: 2.0
      });
    }, 'Error zooming to comment');
  }

  /**
   * Update data status display
   */
  updateDataStatus() {
    const statusElement = BAWUtils.utils.getElement('dataStatus');
    if (!statusElement) return;
    
    const stats = this.api.getStats();
    statusElement.textContent = stats.totalComments > 0
      ? BAWUtils.messages.DATA_COUNT(stats.totalComments)
      : BAWUtils.messages.DATA_READY;
  }

  /**
   * Export comments as JSON and download
   */
  exportJSON() {
    const jsonData = this.api.exportJSON();
    this._downloadFile(jsonData, 'baw-comments.json', 'application/json');
    BAWUtils.ui.showToast(BAWUtils.messages.COMMENT_EXPORT_SUCCESS, "success");
  }

  /**
   * Export comments as CSV and show dialog
   */
  exportCSV() {
    const csvData = this.api.exportCSV();
    
    const previewElement = BAWUtils.utils.getElement('csvPreview');
    const overlay = BAWUtils.utils.getElement('csvExportOverlay');
    
    if (previewElement) {
      const lines = csvData.split('\n');
      const preview = lines.slice(0, 10).join('\n');
      previewElement.textContent = preview + 
        (lines.length > 10 ? '\n... (' + (lines.length - 10) + ' weitere Zeilen)' : '');
    }
    
    if (overlay) overlay.style.display = 'flex';
    
    // Store for later download
    this._csvData = csvData;
  }

  /**
   * Download CSV file
   */
  downloadCSV() {
    if (this._csvData) {
      this._downloadFile(this._csvData, 'baw-comments.csv', 'text/csv');
      this.closeCSVDialog();
      BAWUtils.ui.showToast(BAWUtils.messages.COMMENT_EXPORT_SUCCESS, "success");
    }
  }

  /**
   * Copy CSV to clipboard
   */
  async copyCSVToClipboard() {
    if (!this._csvData) return;
    
    const success = await BAWUtils.utils.safeExecuteAsync(
      async () => {
        await navigator.clipboard.writeText(this._csvData);
        return true;
      },
      'Error copying to clipboard',
      false
    );
    
    if (success) {
      BAWUtils.ui.showToast("CSV in Zwischenablage kopiert", "success");
      this.closeCSVDialog();
    } else {
      BAWUtils.ui.showToast(
        "Fehler beim Kopieren", 
        "error",
        BAWUtils.constants.TOAST_ERROR_DURATION_MS
      );
    }
  }

  /**
   * Close CSV export dialog
   */
  closeCSVDialog() {
    const overlay = BAWUtils.utils.getElement('csvExportOverlay');
    if (overlay) overlay.style.display = 'none';
    this._csvData = null;
  }

  /**
   * Handle file import
   * @param {Event} event - File input change event
   */
  async handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const success = await BAWUtils.utils.safeExecuteAsync(async () => {
      const text = await file.text();
      
      if (file.name.endsWith('.json')) {
        this.api.importData(text);
      } else if (file.name.endsWith('.csv')) {
        this.api.importCSV(text);
      } else {
        throw new Error('Unsupported file format');
      }
      
      this.loadSceneComments();
      BAWUtils.ui.showToast(BAWUtils.messages.COMMENT_IMPORT_SUCCESS, "success");
      return true;
    }, BAWUtils.messages.ERROR_FILE_IMPORT, false);
    
    if (!success) {
      BAWUtils.ui.showToast(
        BAWUtils.messages.ERROR_FILE_IMPORT,
        'error',
        BAWUtils.constants.TOAST_ERROR_DURATION_MS
      );
    }
    
    // Reset file input
    event.target.value = '';
  }

  /**
   * Clear all comment data
   */
  clearAllData() {
    if (!confirm(BAWUtils.messages.DATA_CLEAR_CONFIRM)) {
      return;
    }
    
    this.api.clearAllData();
    this.currentSceneComments = [];
    this.refreshCommentVisuals();
    this.updateCommentsDisplay();
    this.updateDataStatus();
    
    BAWUtils.ui.showToast(BAWUtils.messages.DATA_CLEARED, "success");
  }

  /**
   * Download a file to the user's computer
   * @param {string} data - File data
   * @param {string} filename - File name
   * @param {string} mimeType - MIME type
   * @private
   */
  _downloadFile(data, filename, mimeType) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Clean up resources - IMPORTANT for memory leak prevention
   */
  cleanup() {
    console.log('🧹 Cleaning up comments system...');
    
    // Remove primitives from scene
    if (this.viewer && this.viewer.scene) {
      this._primitives.forEach(primitive => {
        if (this.viewer.scene.primitives.contains(primitive)) {
          this.viewer.scene.primitives.remove(primitive);
        }
      });
    }
    
    // Clear collections
    if (this.billboards) {
      this.billboards.removeAll();
      this.billboards = null;
    }
    if (this.labels) {
      this.labels.removeAll();
      this.labels = null;
    }
    
    // Clear caches
    this.cachedCommentIcon = null;
    this.currentSceneComments = [];
    this._primitives = [];
    this._eventHandlers = [];
    
    // Clear API cache
    if (this.api) {
      this.api._cache.clear();
    }
    
    console.log('✅ Comments cleanup complete');
  }
}
