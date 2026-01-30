/**
 * BAW Cesium Viewer - Comments System
 * Version: 2.0.0
 */

// ===========================
// LocalCommentsAPI Class
// ===========================
class LocalCommentsAPI {
  constructor() {
    this.storageKey = 'baw_cesium_comments';
    this.data = this.loadFromStorage();
    this._cache = new Map();
  }

  loadFromStorage() {
    return BAWUtils.utils.safeExecute(() => {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : this.getDefaultData();
    }, 'Error loading from storage', this.getDefaultData());
  }

  getDefaultData() {
    return { comments: {}, metadata: { version: "1.0" } };
  }

  saveToStorage() {
    return BAWUtils.utils.safeExecute(() => {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      this._cache.clear(); // Clear cache on save
      return true;
    }, 'Error saving to storage', false);
  }

  loadComments(sceneName) {
    // Check cache first
    if (this._cache.has(sceneName)) {
      return this._cache.get(sceneName);
    }

    const comments = (this.data.comments[sceneName] || []).map(comment => ({
      ...comment,
      position: new Cesium.Cartesian3(
        comment.position_x,
        comment.position_y,
        comment.position_z
      )
    }));

    // Cache the result
    this._cache.set(sceneName, comments);
    return comments;
  }

  saveComment(sceneName, comment, position, featureName, userName) {
    if (!this.data.comments[sceneName]) {
      this.data.comments[sceneName] = [];
    }

    const newComment = {
      id: Date.now().toString(),
      text: comment,
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
  }

  updateComment(commentId, newText, sceneName) {
    const comments = this.data.comments[sceneName];
    if (!comments) throw new Error('Scene not found');

    const comment = comments.find(c => c.id === commentId);
    if (!comment) throw new Error('Comment not found');

    comment.text = newText;
    comment.timestamp = new Date().toISOString();
    
    this.saveToStorage();
    return true;
  }

  deleteComment(commentId, sceneName) {
    if (!this.data.comments[sceneName]) throw new Error('Scene not found');

    this.data.comments[sceneName] = this.data.comments[sceneName].filter(c => c.id !== commentId);
    this.saveToStorage();
    return true;
  }

  exportJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  exportCSV() {
    const headers = ['Szene', 'Kommentar', 'Position_X', 'Position_Y', 'Position_Z', 'Feature', 'Datum', 'ID', 'Benutzer'];
    const rows = [headers.join(',')];

    Object.entries(this.data.comments).forEach(([sceneName, comments]) => {
      comments.forEach(comment => {
        const row = [
          `"${sceneName}"`,
          `"${comment.text.replace(/"/g, '""')}"`,
          comment.position_x.toFixed(6),
          comment.position_y.toFixed(6),
          comment.position_z.toFixed(6),
          `"${comment.featureName || ''}"`,
          `"${comment.timestamp}"`,
          `"${comment.id}"`,
          `"${comment.user}"`
        ];
        rows.push(row.join(','));
      });
    });

    return rows.join('\n');
  }

  importData(jsonData) {
    const parsed = JSON.parse(jsonData);
    
    if (!parsed.comments || typeof parsed.comments !== 'object') {
      throw new Error('Invalid data structure');
    }

    this.data = parsed;
    this.saveToStorage();
    return true;
  }

  importCSV(csvData) {
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header and one data row');
    }

    this.data.comments = {};
    
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
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
    return true;
  }

  parseCSVLine(line) {
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

  clearAllData() {
    this.data = this.getDefaultData();
    this._cache.clear();
    this.saveToStorage();
  }

  getStats() {
    let totalComments = 0;
    const scenes = Object.keys(this.data.comments);
    
    scenes.forEach(scene => {
      totalComments += this.data.comments[scene].length;
    });
    
    return { totalComments, scenes: scenes.length, scenesWithComments: scenes };
  }
}

// ===========================
// Comments Manager Class
// ===========================
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
  }

  init(viewer) {
    this.viewer = viewer;
    console.log("💬 Initializing comments system...");
    
    this.billboards = new Cesium.BillboardCollection();
    this.labels = new Cesium.LabelCollection();
    
    this.viewer.scene.primitives.add(this.billboards);
    this.viewer.scene.primitives.add(this.labels);
    
    console.log("✅ Comments system ready");
  }

  setCurrentGroup(group) {
    this.currentGroup = group;
  }

  setUserName(userName) {
    this.userName = userName;
  }

  toggleCommentMode() {
    if (this.isCommentMode) {
      this.exitCommentMode();
    } else {
      this.enterCommentMode();
    }
  }

  enterCommentMode() {
    if (!this.userName) {
      BAWUtils.ui.showToast("Bitte geben Sie zuerst Ihren Namen ein", "warning");
      BAWUtils.utils.getElement('userName')?.focus();
      return;
    }
    
    if (!this.currentGroup) {
      BAWUtils.ui.showToast("Bitte laden Sie zuerst eine Szene", "warning");
      return;
    }
    
    this.isCommentMode = true;
    this.updateCommentModeUI();
    
    BAWUtils.ui.toggleVisibility('commentModeIndicator', true);
    BAWUtils.ui.showToast("Kommentar-Modus aktiviert. Klicken Sie auf die Karte.", "success");
  }

  exitCommentMode() {
    this.isCommentMode = false;
    this.pendingPosition = null;
    this.pendingFeature = null;
    this.updateCommentModeUI();
    
    BAWUtils.ui.toggleVisibility('commentModeIndicator', false);
  }

  handleCommentModeClick(click) {
    const pickedFeature = this.viewer.scene.pick(click.position);
    let cartesian = null;
    let featureName = null;
    
    if (pickedFeature instanceof Cesium.Cesium3DTileFeature) {
      cartesian = BAWUtils.utils.safeExecute(() => {
        const pos = this.viewer.scene.pickPosition(click.position);
        if (pos) return pos;
        
        const ellipsoidPos = this.viewer.camera.pickEllipsoid(click.position, this.viewer.scene.globe.ellipsoid);
        if (ellipsoidPos) {
          const cartographic = Cesium.Cartographic.fromCartesian(ellipsoidPos);
          cartographic.height += 10.0;
          return Cesium.Cartesian3.fromRadians(
            cartographic.longitude, 
            cartographic.latitude, 
            cartographic.height
          );
        }
        return null;
      }, "Error getting feature position");
      
      featureName = pickedFeature.getProperty("name") || "Feature";
    } else {
      cartesian = this.viewer.camera.pickEllipsoid(click.position, this.viewer.scene.globe.ellipsoid);
    }
    
    if (!cartesian) {
      BAWUtils.ui.showToast("Ungültige Position für Kommentar", "warning");
      return;
    }

    this.pendingPosition = cartesian;
    this.pendingFeature = featureName;

    const modeText = BAWUtils.utils.getElement('commentModeText');
    if (modeText) {
      modeText.textContent = featureName 
        ? `Position gewählt: ${featureName} - Kommentar eingeben`
        : 'Position gewählt - Kommentar eingeben und hinzufügen';
    }

    BAWUtils.utils.getElement('commentInput')?.focus();
  }

  addComment() {
    if (!this.pendingPosition) return;
    
    const commentInput = BAWUtils.utils.getElement('commentInput');
    const text = commentInput?.value.trim();
    
    if (!text) {
      BAWUtils.ui.showToast("Bitte geben Sie einen Kommentar ein", "warning");
      return;
    }
    
    if (!this.userName) {
      BAWUtils.ui.showToast("Bitte geben Sie Ihren Namen ein", "warning");
      return;
    }
    
    if (!this.currentGroup) {
      BAWUtils.ui.showToast("Bitte laden Sie zuerst eine Szene", "warning");
      return;
    }
    
    try {
      const comment = this.api.saveComment(
        this.currentGroup.name,
        text,
        this.pendingPosition,
        this.pendingFeature,
        this.userName
      );
      
      this.currentSceneComments.push(comment);
      this.updateCommentsDisplay();
      this.addCommentVisual(comment, this.currentSceneComments.length - 1);
      this.updateDataStatus();
      
      if (commentInput) commentInput.value = '';
      this.exitCommentMode();
      
      BAWUtils.ui.showToast("Kommentar gespeichert!", "success");
    } catch (error) {
      console.error("Failed to save comment:", error);
      BAWUtils.ui.showToast("Fehler beim Speichern: " + error.message, "error");
    }
  }

  loadCommentsFromStorage() {
    if (!this.currentGroup) {
      this.currentSceneComments = [];
      this.updateCommentsDisplay();
      return;
    }
    
    try {
      const comments = this.api.loadComments(this.currentGroup.name);
      this.currentSceneComments = comments;
      
      console.log(`📥 Loaded ${comments.length} comments from storage`);
      this.updateCommentsDisplay();
      this.refreshCommentVisuals();
      
      if (comments.length > 0) {
        BAWUtils.ui.showToast(`${comments.length} Kommentare geladen`, 'success', 2000);
      }
    } catch (error) {
      console.error("Failed to load comments from storage:", error);
      BAWUtils.ui.showToast("Fehler beim Laden der Kommentare: " + error.message, "error");
      this.currentSceneComments = [];
      this.updateCommentsDisplay();
    }
  }

  refreshCommentVisuals() {
    this.billboards.removeAll();
    this.labels.removeAll();
    
    this.currentSceneComments.forEach((comment, index) => {
      this.addCommentVisual(comment, index);
    });
  }

  createCommentIcon() {
    const canvas = document.createElement('canvas');
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#4FC3F7';
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💬', size/2, size/2);
    
    return canvas;
  }

  addCommentVisual(comment, index) {
    // Create comment icon once and reuse
    if (!this.cachedCommentIcon) {
      this.cachedCommentIcon = this.createCommentIcon();
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
  }

  updateCommentsDisplay() {
    const commentsList = BAWUtils.utils.getElement('commentsList');
    if (!commentsList) return;
    
    if (this.currentSceneComments.length === 0) {
      commentsList.innerHTML = `
        <div class="no-comments">
          Noch keine Kommentare vorhanden.<br>
          <small>Aktivieren Sie den Hinzufügen-Modus und klicken Sie auf die Karte.</small>
        </div>
      `;
      return;
    }
    
    const sortedComments = [...this.currentSceneComments].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // Use DocumentFragment for better performance
    const container = document.createElement('div');
    
    sortedComments.forEach(comment => {
      const { date, time } = BAWUtils.utils.formatDateTime(comment.timestamp);
      
      const commentDiv = document.createElement('div');
      commentDiv.className = 'comment-item';
      commentDiv.dataset.commentId = comment.id;
      
      commentDiv.innerHTML = `
        <div class="comment-header">
          <div class="comment-info">${date} ${time}</div>
          <div class="comment-actions">
            <button class="btn btn-ghost btn-small" data-action="zoom" data-id="${comment.id}">👁️</button>
            <button class="btn btn-ghost btn-small" data-action="edit" data-id="${comment.id}">✏️</button>
            <button class="btn btn-danger btn-small" data-action="delete" data-id="${comment.id}">🗑️</button>
          </div>
        </div>
        <div class="comment-text">${comment.text}</div>
        ${comment.featureName ? `<div class="comment-feature">📍 ${comment.featureName}</div>` : ''}
        <div class="comment-user">👤 ${comment.user || 'Unbekannt'}</div>
        <div class="comment-location">
          ${comment.position.x.toFixed(1)}, ${comment.position.y.toFixed(1)}, ${comment.position.z.toFixed(1)}
        </div>
      `;
      
      container.appendChild(commentDiv);
    });
    
    // Attach event handlers using delegation
    container.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (button) {
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
    });
    
    commentsList.innerHTML = '';
    commentsList.appendChild(container);
  }

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
      if (elements.modeText) elements.modeText.textContent = 'Laden Sie zuerst eine Szene';
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
      if (elements.modeText) elements.modeText.textContent = 'Kommentar-Modus: Aktiv - Klicken Sie auf die Karte';
      if (elements.toggleBtn) {
        elements.toggleBtn.textContent = '❌ Stoppen';
        elements.toggleBtn.className = 'btn btn-danger btn-small';
      }
      ['commentInput', 'addBtn', 'cancelBtn'].forEach(key => {
        if (elements[key]) elements[key].disabled = false;
      });
    } else {
      if (elements.modeText) elements.modeText.textContent = 'Kommentar-Modus: Inaktiv';
      if (elements.toggleBtn) {
        elements.toggleBtn.textContent = '✏️ Hinzufügen';
        elements.toggleBtn.className = 'btn btn-primary btn-small';
      }
      ['commentInput', 'addBtn', 'cancelBtn'].forEach(key => {
        if (elements[key]) elements[key].disabled = true;
      });
    }
  }

  openEditComment(commentId) {
    const comment = this.currentSceneComments.find(c => c.id === commentId);
    if (!comment) return;
    
    this.currentEditId = commentId;
    const editInput = BAWUtils.utils.getElement('commentEditInput');
    if (editInput) editInput.value = comment.text;
    
    BAWUtils.ui.toggleVisibility('commentEditOverlay', true);
    const overlay = BAWUtils.utils.getElement('commentEditOverlay');
    if (overlay) overlay.style.display = 'flex';
  }

  closeEditComment() {
    this.currentEditId = null;
    BAWUtils.ui.toggleVisibility('commentEditOverlay', false);
    const overlay = BAWUtils.utils.getElement('commentEditOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  saveEditComment() {
    if (!this.currentEditId) return;
    
    const editInput = BAWUtils.utils.getElement('commentEditInput');
    const newText = editInput?.value.trim();
    
    if (!newText) {
      BAWUtils.ui.showToast("Kommentar darf nicht leer sein", "warning");
      return;
    }
    
    this.editComment(this.currentEditId, newText);
    this.closeEditComment();
  }

  editComment(commentId, newText) {
    if (!this.currentGroup) {
      BAWUtils.ui.showToast("Keine Szene geladen", "warning");
      return;
    }
    
    try {
      this.api.updateComment(commentId, newText, this.currentGroup.name);
      
      const comment = this.currentSceneComments.find(c => c.id === commentId);
      if (comment) {
        comment.text = newText;
        comment.timestamp = new Date().toISOString();
      }
      
      this.updateCommentsDisplay();
      this.refreshCommentVisuals();
      
      BAWUtils.ui.showToast("Kommentar aktualisiert!", "success");
    } catch (error) {
      console.error("Failed to update comment:", error);
      BAWUtils.ui.showToast("Fehler beim Aktualisieren: " + error.message, "error");
    }
  }

  deleteComment(commentId) {
    if (!confirm("Möchten Sie diesen Kommentar wirklich löschen?")) {
      return;
    }
    
    if (!this.currentGroup) {
      BAWUtils.ui.showToast("Keine Szene geladen", "warning");
      return;
    }
    
    try {
      this.api.deleteComment(commentId, this.currentGroup.name);
      
      this.currentSceneComments = this.currentSceneComments.filter(c => c.id !== commentId);
      this.updateCommentsDisplay();
      this.refreshCommentVisuals();
      this.updateDataStatus();
      
      BAWUtils.ui.showToast("Kommentar gelöscht!", "success");
    } catch (error) {
      console.error("Failed to delete comment:", error);
      BAWUtils.ui.showToast("Fehler beim Löschen: " + error.message, "error");
    }
  }

  zoomToComment(commentId) {
    const comment = this.currentSceneComments.find(c => c.id === commentId);
    if (!comment) return;
    
    const cartographic = Cesium.Cartographic.fromCartesian(comment.position);
    
    const cameraPosition = Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude, 
      cartographic.height + 50
    );
    
    this.viewer.camera.flyTo({
      destination: cameraPosition,
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-30),
        roll: 0.0
      },
      duration: 2.5,
      complete: () => this.highlightComment(commentId)
    });
  }

  highlightComment(commentId) {
    // Find and pulse the billboard
    for (let i = 0; i < this.billboards.length; i++) {
      const billboard = this.billboards.get(i);
      if (billboard.id === `comment_${commentId}`) {
        this.pulseEntity(billboard);
        this.showCommentLabel(commentId);
        break;
      }
    }
  }

  pulseEntity(entity) {
    let pulseCount = 0;
    const originalScale = entity.scale;
    
    const pulse = () => {
      if (pulseCount < 6) {
        entity.scale = pulseCount % 2 === 0 ? originalScale * 1.5 : originalScale;
        pulseCount++;
        setTimeout(pulse, 300);
      } else {
        entity.scale = originalScale;
      }
    };
    
    pulse();
  }

  showCommentLabel(commentId) {
    const labelId = `comment_label_${commentId}`;
    for (let j = 0; j < this.labels.length; j++) {
      const label = this.labels.get(j);
      if (label.id === labelId) {
        label.show = true;
        setTimeout(() => { label.show = false; }, 3000);
        break;
      }
    }
  }

  handleMouseMove(movement) {
    // Hide all labels first
    for (let i = 0; i < this.labels.length; i++) {
      this.labels.get(i).show = false;
    }
    
    const feature = this.viewer.scene.pick(movement.endPosition);
    
    // Show label for hovered comment
    if (feature?.id?.startsWith?.('comment_')) {
      const commentId = feature.id.replace('comment_', '');
      const labelId = `comment_label_${commentId}`;
      
      for (let i = 0; i < this.labels.length; i++) {
        const label = this.labels.get(i);
        if (label.id === labelId) {
          label.show = true;
          break;
        }
      }
    }
  }

  updateDataStatus() {
    const stats = this.api.getStats();
    BAWUtils.ui.updateText('dataStatus', `${stats.totalComments} Kommentare in ${stats.scenes} Szenen`);
  }

  // Data management methods
  exportJSON() {
    const jsonData = this.api.exportJSON();
    BAWUtils.utils.downloadFile(jsonData, 'application/json', 'baw-kommentare', 'json');
    BAWUtils.ui.showToast('JSON-Datei heruntergeladen!', 'success');
  }

  exportCSV() {
    const csvData = this.api.exportCSV();
    const preview = BAWUtils.utils.getElement('csvPreview');
    if (preview) preview.textContent = csvData;
    
    const overlay = BAWUtils.utils.getElement('csvExportOverlay');
    if (overlay) overlay.style.display = 'flex';
    
    window.currentCSVData = csvData; // Store for download
  }

  downloadCSV() {
    BAWUtils.utils.downloadFile(window.currentCSVData, 'text/csv;charset=utf-8;', 'baw-kommentare', 'csv');
    this.closeCSVDialog();
    BAWUtils.ui.showToast('CSV-Datei heruntergeladen!', 'success');
  }

  async copyCSVToClipboard() {
    try {
      await navigator.clipboard.writeText(window.currentCSVData);
      BAWUtils.ui.showToast('CSV in Zwischenablage kopiert!', 'success');
    } catch (error) {
      BAWUtils.ui.showToast('Fehler beim Kopieren in die Zwischenablage', 'error');
    }
  }

  closeCSVDialog() {
    const overlay = BAWUtils.utils.getElement('csvExportOverlay');
    if (overlay) overlay.style.display = 'none';
    window.currentCSVData = null;
  }

  handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        
        if (file.name.endsWith('.json')) {
          this.api.importData(content);
        } else if (file.name.endsWith('.csv')) {
          this.api.importCSV(content);
        } else {
          throw new Error('Unsupported file type');
        }
        
        this.updateDataStatus();
        this.loadCommentsFromStorage();
        BAWUtils.ui.showToast('Daten erfolgreich importiert!', 'success');
        
      } catch (error) {
        BAWUtils.ui.showToast('Fehler beim Importieren: ' + error.message, 'error');
      }
    };
    
    reader.readAsText(file);
    event.target.value = '';
  }

  clearAllData() {
    if (confirm('Möchten Sie wirklich alle Kommentare löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      this.api.clearAllData();
      this.updateDataStatus();
      this.loadCommentsFromStorage();
      BAWUtils.ui.showToast('Alle Daten gelöscht!', 'success');
    }
  }
}

// Export for use in core module
window.CommentsManager = CommentsManager;