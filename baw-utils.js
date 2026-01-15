/**
 * BAW Cesium Viewer - Utilities and Configuration
 * Version: 2.0.0
 * Cesium Version: 1.132
 */

// ===========================
// Global Configuration
// ===========================
const BAWConfig = {
  cesium: {
    accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlMDkwZDM4OC00NzRhLTQyMmYtOTI2ZS02NGZiM2Q2MTE2OGMiLCJpZCI6MjYzNTkwLCJpYXQiOjE3NDExNzk0MTB9.jnf8NDf2PoydWpK3mwDkbp8IYIif5T_-Ioy3Bx6n3Cc",
    version: "1.132"
  },
  
  modelGroups: [
    {
      name: "Schleuse Zeltingen",
      modelAssetIds: [3251780, 3341583],
      terrainAssetId: 3254695,
      imageryAssetId: 3255165,
    },
    {
      name: "Schleuse Lauffen", 
      modelAssetIds: [3256557, 3256547, 3256555, 3273407],
      terrainAssetId: 3242970,
      imageryAssetId: 3242987,
    },
  ],
  
  objektartenMap: { 
    "213": "Wehranlagen" 
  },
  
  objektteileMap: {
    "213": {
      "151": "Verschlusskörper",
      "142": "Wehrschwelle"
    }
  },
  
  pointCloudDefaults: {
    pointSize: 3,
    pointBudget: 16,
    screenSpaceError: 16,
    colorMode: 'rgb',
    eyeDomeLighting: true,
    attenuation: true,
    silhouette: false
  },
  
  renderQualitySettings: {
    performance: {
      name: "Performance",
      description: "Optimiert für schwächere PCs - maximale FPS",
      settings: {
        maximumScreenSpaceError: 32,
        maximumMemoryUsage: 64,
        msaaSamples: 1,
        enableLighting: false,
        fogEnabled: false,
        skyAtmosphereShow: false,
        depthTestAgainstTerrain: false,
        fxaaEnabled: false,
        bloomEnabled: false,
        resolutionScale: 0.8,
        cullRequestsWhileMoving: true,
        cullRequestsWhileMovingMultiplier: 30.0,
        dynamicScreenSpaceError: true,
        requestRenderMode: true,
        tileCacheSize: 50,
        pointCloudMaxAttenuation: 5,
        pointCloudBaseResolution: 10
      }
    },
    balanced: {
      name: "Ausgeglichen", 
      description: "Optimiert für gute Balance zwischen Qualität und Performance",
      settings: {
        maximumScreenSpaceError: 16,
        maximumMemoryUsage: 128,
        msaaSamples: 1,
        enableLighting: false,
        fogEnabled: false,
        skyAtmosphereShow: true,
        depthTestAgainstTerrain: false,
        fxaaEnabled: false,
        bloomEnabled: false,
        resolutionScale: 1.0,
        cullRequestsWhileMoving: true,
        cullRequestsWhileMovingMultiplier: 60.0,
        dynamicScreenSpaceError: true,
        requestRenderMode: true,
        tileCacheSize: 100,
        pointCloudMaxAttenuation: 10,
        pointCloudBaseResolution: 5
      }
    },
    quality: {
      name: "Qualität",
      description: "Maximale Qualität für leistungsstarke PCs",
      settings: {
        maximumScreenSpaceError: 8,
        maximumMemoryUsage: 256,
        msaaSamples: 4,
        enableLighting: true,
        fogEnabled: true,
        skyAtmosphereShow: true,
        depthTestAgainstTerrain: true,
        fxaaEnabled: true,
        bloomEnabled: false,
        resolutionScale: 1.25,
        cullRequestsWhileMoving: false,
        cullRequestsWhileMovingMultiplier: 120.0,
        dynamicScreenSpaceError: false,
        requestRenderMode: false,
        tileCacheSize: 200,
        pointCloudMaxAttenuation: 20,
        pointCloudBaseResolution: 2
      }
    }
  }
};

// ===========================
// Utility Functions
// ===========================
const Utils = {
  // DOM Element Cache
  _elementCache: new Map(),
  
  // Debounce function for performance
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Throttle function for performance
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // Safe DOM element getter with caching
  getElement(id) {
    if (!this._elementCache.has(id)) {
      this._elementCache.set(id, document.getElementById(id));
    }
    return this._elementCache.get(id);
  },

  // Clear element cache
  clearElementCache() {
    this._elementCache.clear();
  },

  // Safe try-catch wrapper
  safeExecute(func, errorMessage = "Operation failed", fallback = null) {
    try {
      return func();
    } catch (error) {
      console.error(errorMessage, error);
      return fallback;
    }
  },

  // Performance monitoring
  measurePerformance(name, func) {
    const startTime = performance.now();
    const result = func();
    const endTime = performance.now();
    console.log(`⏱️ ${name} took ${(endTime - startTime).toFixed(2)}ms`);
    return result;
  },
  
  // Download file helper
  downloadFile(data, mimeType, filename, extension) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  
  // Format date/time for display
  formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('de-DE'),
      time: date.toLocaleTimeString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    };
  },
  
  // Validate Cartesian3 position
  isValidPosition(position) {
    return position && 
           typeof position.x === 'number' && 
           typeof position.y === 'number' && 
           typeof position.z === 'number';
  },
  
  // Create DocumentFragment for better DOM performance
  createFragment(htmlString) {
    const template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content;
  }
};

// ===========================
// UI Helper Functions
// ===========================
const UIHelpers = {
  // Show loading overlay
  showLoading(text = "Lädt...") {
    const loadingText = Utils.getElement("loadingText");
    if (loadingText) loadingText.textContent = text;
    
    const overlay = Utils.getElement("loadingOverlay");
    if (overlay) overlay.classList.remove("hidden");
  },

  // Hide loading overlay
  hideLoading() {
    const overlay = Utils.getElement("loadingOverlay");
    if (overlay) overlay.classList.add("hidden");
  },

  // Show toast notification
  showToast(message, type = "info", duration = 4000) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    const icons = {
      success: "✅",
      error: "❌",
      warning: "⚠️",
      info: "ℹ️"
    };
    
    toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
    
    const container = Utils.getElement("toastContainer");
    if (container) {
      container.appendChild(toast);
      
      setTimeout(() => {
        toast.style.animation = "slideIn 0.3s ease reverse";
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  },

  // Handle errors consistently
  handleError(message, error) {
    console.error(message, error);
    this.hideLoading();
    this.showToast(`${message}: ${error.message}`, "error", 6000);
  },
  
  // Update element text content safely
  updateText(elementId, text) {
    const element = Utils.getElement(elementId);
    if (element) element.textContent = text;
  },
  
  // Update element HTML safely
  updateHTML(elementId, html) {
    const element = Utils.getElement(elementId);
    if (element) element.innerHTML = html;
  },
  
  // Toggle element visibility
  toggleVisibility(elementId, show) {
    const element = Utils.getElement(elementId);
    if (element) {
      element.style.display = show ? 'block' : 'none';
    }
  },
  
  // Enable/disable element
  setEnabled(elementId, enabled) {
    const element = Utils.getElement(elementId);
    if (element) {
      element.disabled = !enabled;
    }
  },
  
  // Set checkbox state
  setChecked(elementId, checked) {
    const element = Utils.getElement(elementId);
    if (element && element.type === 'checkbox') {
      element.checked = checked;
    }
  }
};

// ===========================
// Measurement System
// ===========================
class MeasurementSystem {
  constructor(viewer) {
    this.viewer = viewer;
    this.isActive = false;
    this.currentMode = null;
    this.activePoints = [];
    this.measurementEntities = [];
    this.measurementHistory = [];
    this.currentMeasurement = null;
  }

  setMode(mode) {
    console.log(`📏 Setting measurement mode: ${mode}`);
    
    this.cancelCurrentMeasurement();
    
    this.currentMode = mode;
    this.isActive = mode !== '';
    
    const instructions = Utils.getElement('measureInstructions');
    const instructionText = Utils.getElement('instructionText');
    const finishBtn = Utils.getElement('finishMeasurement');
    const cancelBtn = Utils.getElement('cancelMeasurement');
    
    if (mode) {
      if (instructions) instructions.style.display = 'block';
      if (cancelBtn) cancelBtn.style.display = 'inline-flex';
      
      const instructionTexts = {
        'height': 'Klicken Sie auf einen Punkt, um die Höhe über dem Terrain zu messen.',
        'distance': 'Klicken Sie auf zwei Punkte, um den Abstand zu messen.',
        'polyline': 'Klicken Sie mehrere Punkte für eine Polygon-Längenmessung. "Beenden" zum Abschließen.',
        'area': 'Klicken Sie Punkte für eine Flächenmessung. Mindestens 3 Punkte erforderlich. "Beenden" zum Abschließen.'
      };
      
      if (instructionText) instructionText.textContent = instructionTexts[mode] || '';
      if (finishBtn) finishBtn.style.display = (mode === 'polyline' || mode === 'area') ? 'inline-flex' : 'none';
      
      UIHelpers.showToast(`Mess-Modus aktiviert: ${this.getModeDisplayName(mode)}`, 'info', 3000);
    } else {
      if (instructions) instructions.style.display = 'none';
      if (finishBtn) finishBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
    }
    
    this.updateDisplay();
  }

  getModeDisplayName(mode) {
    const names = {
      'height': 'Höhe über Terrain',
      'distance': 'Punkt-zu-Punkt Abstand',
      'polyline': 'Polygon-Länge',
      'area': 'Polygon-Fläche'
    };
    return names[mode] || mode;
  }

  handleClick(click) {
    const position = this.getClickPosition(click);
    if (!position) {
      UIHelpers.showToast('Ungültige Position - klicken Sie auf das Terrain oder ein Objekt', 'warning');
      return;
    }
    
    this.activePoints.push(position);
    
    switch (this.currentMode) {
      case 'height':
        this.measureHeight(position);
        break;
      case 'distance':
        this.measureDistance();
        break;
      case 'polyline':
        this.measurePolylineLength();
        break;
      case 'area':
        this.measurePolygonArea();
        break;
    }
    
    this.addMeasurementPoint(position, this.activePoints.length);
  }

  getClickPosition(click) {
    let position = this.viewer.scene.pickPosition(click.position);
    
    if (!position) {
      position = this.viewer.camera.pickEllipsoid(click.position, this.viewer.scene.globe.ellipsoid);
    }
    
    return position;
  }

  measureHeight(position) {
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const originalHeight = cartographic.height;
    
    const terrainProvider = this.viewer.terrainProvider;
    const cartographicCopy = Cesium.Cartographic.fromCartesian(position);
    
    Cesium.sampleTerrainMostDetailed(terrainProvider, [cartographicCopy])
      .then((updatedPositions) => {
        if (updatedPositions && updatedPositions.length > 0) {
          const terrainHeight = updatedPositions[0].height;
          const heightAboveTerrain = originalHeight - terrainHeight;
          
          this.displayMeasurement(`${heightAboveTerrain.toFixed(2)} m`, 
            `Über Terrain (${terrainHeight.toFixed(2)} m Terrain-Höhe)`);
          
          this.addToHistory('Höhe über Terrain', `${heightAboveTerrain.toFixed(2)} m`);
        } else {
          this.displayMeasurement(`${originalHeight.toFixed(2)} m`, 
            'Über Ellipsoid (Terrain-Sampling fehlgeschlagen)');
          this.addToHistory('Höhe über Ellipsoid', `${originalHeight.toFixed(2)} m`);
        }
        
        setTimeout(() => this.resetCurrentMeasurement(), 2000);
      })
      .catch((error) => {
        console.warn("Terrain sampling failed:", error);
        this.displayMeasurement(`${originalHeight.toFixed(2)} m`, 
          'Über Ellipsoid (Terrain-Provider nicht verfügbar)');
        this.addToHistory('Höhe über Ellipsoid', `${originalHeight.toFixed(2)} m`);
        
        setTimeout(() => this.resetCurrentMeasurement(), 2000);
      });
  }

  measureDistance() {
    if (this.activePoints.length === 2) {
      const distance = Cesium.Cartesian3.distance(
        this.activePoints[0],
        this.activePoints[1]
      );
      
      this.displayMeasurement(`${distance.toFixed(2)} m`, 
        `Direkte Luftlinie zwischen 2 Punkten`);
      
      this.addToHistory('Abstand', `${distance.toFixed(2)} m`);
      this.drawMeasurementLine(this.activePoints[0], this.activePoints[1], `${distance.toFixed(2)} m`);
      
      setTimeout(() => this.resetCurrentMeasurement(), 2000);
    } else if (this.activePoints.length === 1) {
      this.displayMeasurement('Klicken Sie den zweiten Punkt...', 'Erster Punkt gesetzt');
    }
  }

  measurePolylineLength() {
    if (this.activePoints.length >= 2) {
      let totalLength = 0;
      const points = this.activePoints;
      
      for (let i = 1; i < points.length; i++) {
        totalLength += Cesium.Cartesian3.distance(points[i-1], points[i]);
      }
      
      this.displayMeasurement(`${totalLength.toFixed(2)} m`, 
        `Länge über ${points.length} Punkte`);
      
      this.drawMeasurementPolyline(points, `${totalLength.toFixed(2)} m`);
    } else {
      this.displayMeasurement('Mindestens 2 Punkte erforderlich...', 
        `${this.activePoints.length} Punkt(e) gesetzt`);
    }
  }

  measurePolygonArea() {
    const points = this.activePoints;
    
    if (points.length >= 3) {
      try {
        const cartographics = points.map(p => Cesium.Cartographic.fromCartesian(p));
        let area = 0;
        
        for (let i = 0; i < cartographics.length; i++) {
          const j = (i + 1) % cartographics.length;
          area += cartographics[i].longitude * cartographics[j].latitude;
          area -= cartographics[j].longitude * cartographics[i].latitude;
        }
        
        area = Math.abs(area) / 2;
        const areaM2 = area * Math.pow(6371000, 2);
        
        let displayArea, unit;
        if (areaM2 > 10000) {
          displayArea = (areaM2 / 10000).toFixed(2);
          unit = 'ha';
        } else {
          displayArea = areaM2.toFixed(2);
          unit = 'm²';
        }
        
        this.displayMeasurement(`${displayArea} ${unit}`, 
          `Polygon mit ${points.length} Punkten`);
        
        this.drawMeasurementPolygon(points, `${displayArea} ${unit}`);
        
      } catch (error) {
        console.error("Error calculating polygon area:", error);
        this.displayMeasurement('Fehler bei Flächenberechnung', 
          `${points.length} Punkte gesetzt`);
      }
    } else {
      this.displayMeasurement('Mindestens 3 Punkte erforderlich...', 
        `${points.length} Punkt(e) gesetzt`);
    }
  }

  addMeasurementPoint(position, number) {
    if (!Utils.isValidPosition(position)) {
      console.warn("Cannot add measurement point: invalid position", position);
      return;
    }
    
    try {
      const point = this.viewer.entities.add({
        position: position,
        point: {
          pixelSize: 8,
          color: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.NONE
        },
        label: {
          text: number.toString(),
          font: '12pt Arial',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          heightReference: Cesium.HeightReference.NONE
        }
      });
      
      this.measurementEntities.push(point);
      
    } catch (error) {
      console.error("Error adding measurement point:", error);
      UIHelpers.showToast("Fehler beim Hinzufügen des Messpunkts", "error");
    }
  }

  drawMeasurementLine(start, end, label) {
    if (!start || !end) return;
    
    try {
      const line = this.viewer.entities.add({
        polyline: {
          positions: [start, end],
          width: 3,
          material: Cesium.Color.CYAN,
          clampToGround: false,
          followSurface: false
        }
      });
      
      const midpoint = Cesium.Cartesian3.midpoint(start, end, new Cesium.Cartesian3());
      const labelEntity = this.viewer.entities.add({
        position: midpoint,
        label: {
          text: label,
          font: '14pt Arial',
          fillColor: Cesium.Color.WHITE,
          backgroundColor: Cesium.Color.BLUE.withAlpha(0.7),
          backgroundPadding: new Cesium.Cartesian2(8, 4),
          pixelOffset: new Cesium.Cartesian2(0, -10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      
      this.measurementEntities.push(line, labelEntity);
      
    } catch (error) {
      console.error("Error drawing line:", error);
      UIHelpers.showToast("Fehler beim Zeichnen der Linie", "error");
    }
  }

  drawMeasurementPolyline(points, label) {
    const validPoints = points.filter(Utils.isValidPosition);
    if (validPoints.length < 2) return;
    
    try {
      const polyline = this.viewer.entities.add({
        polyline: {
          positions: validPoints,
          width: 3,
          material: Cesium.Color.CYAN,
          clampToGround: false,
          followSurface: false
        }
      });
      
      const lastPoint = validPoints[validPoints.length - 1];
      const labelEntity = this.viewer.entities.add({
        position: lastPoint,
        label: {
          text: label,
          font: '14pt Arial',
          fillColor: Cesium.Color.WHITE,
          backgroundColor: Cesium.Color.BLUE.withAlpha(0.7),
          backgroundPadding: new Cesium.Cartesian2(8, 4),
          pixelOffset: new Cesium.Cartesian2(0, -25),
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
      });
      
      this.measurementEntities.push(polyline, labelEntity);
      
    } catch (error) {
      console.error("Error drawing polyline:", error);
      UIHelpers.showToast("Fehler beim Zeichnen der Linie", "error");
    }
  }

  drawMeasurementPolygon(points, label) {
    const validPoints = points.filter(Utils.isValidPosition);
    if (validPoints.length < 3) return;
    
    try {
      const polygon = this.viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(validPoints),
          material: Cesium.Color.CYAN.withAlpha(0.3),
          outline: true,
          outlineColor: Cesium.Color.CYAN,
          height: 0,
          extrudedHeight: 0,
          closeTop: true,
          closeBottom: true
        }
      });
      
      let centerX = 0, centerY = 0, centerZ = 0;
      validPoints.forEach(point => {
        centerX += point.x;
        centerY += point.y;
        centerZ += point.z;
      });
      
      const center = new Cesium.Cartesian3(
        centerX / validPoints.length,
        centerY / validPoints.length,
        centerZ / validPoints.length
      );
      
      const labelEntity = this.viewer.entities.add({
        position: center,
        label: {
          text: label,
          font: '14pt Arial',
          fillColor: Cesium.Color.WHITE,
          backgroundColor: Cesium.Color.BLUE.withAlpha(0.7),
          backgroundPadding: new Cesium.Cartesian2(8, 4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          pixelOffset: new Cesium.Cartesian2(0, -10)
        }
      });
      
      this.measurementEntities.push(polygon, labelEntity);
      
    } catch (error) {
      console.error("Error drawing polygon:", error);
      UIHelpers.showToast("Fehler beim Zeichnen des Polygons", "error");
    }
  }

  displayMeasurement(value, details) {
    UIHelpers.toggleVisibility('currentMeasurement', true);
    UIHelpers.updateText('measurementValue', value);
    UIHelpers.updateText('measurementDetails', details);
  }

  addToHistory(type, value) {
    this.measurementHistory.unshift({
      type: type,
      value: value,
      timestamp: new Date().toLocaleTimeString()
    });
    
    if (this.measurementHistory.length > 10) {
      this.measurementHistory.pop();
    }
    
    this.updateHistoryDisplay();
  }

  updateHistoryDisplay() {
    const historyTitle = Utils.getElement('historyTitle');
    const historyList = Utils.getElement('historyList');
    
    if (this.measurementHistory.length > 0) {
      if (historyTitle) historyTitle.style.display = 'block';
      
      if (historyList) {
        const html = this.measurementHistory.map(item => `
          <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin-bottom: 4px; font-size: 12px;">
            <div style="font-weight: 500; color: #333;">${item.type}: ${item.value}</div>
            <div style="color: #666;">${item.timestamp}</div>
          </div>
        `).join('');
        
        historyList.innerHTML = html;
      }
    } else {
      if (historyTitle) historyTitle.style.display = 'none';
      if (historyList) historyList.innerHTML = '';
    }
  }

  finishCurrentMeasurement() {
    const mode = this.currentMode;
    const points = this.activePoints;
    
    if (mode === 'polyline' && points.length >= 2) {
      let totalLength = 0;
      for (let i = 1; i < points.length; i++) {
        totalLength += Cesium.Cartesian3.distance(points[i-1], points[i]);
      }
      this.addToHistory('Polygon-Länge', `${totalLength.toFixed(2)} m`);
      UIHelpers.showToast(`Polygon-Länge: ${totalLength.toFixed(2)} m`, 'success');
      
    } else if (mode === 'area' && points.length >= 3) {
      const cartographics = points.map(p => Cesium.Cartographic.fromCartesian(p));
      let area = 0;
      
      for (let i = 0; i < cartographics.length; i++) {
        const j = (i + 1) % cartographics.length;
        area += cartographics[i].longitude * cartographics[j].latitude;
        area -= cartographics[j].longitude * cartographics[i].latitude;
      }
      
      area = Math.abs(area) / 2;
      const areaM2 = area * Math.pow(6371000, 2);
      
      let displayArea, unit;
      if (areaM2 > 10000) {
        displayArea = (areaM2 / 10000).toFixed(2);
        unit = 'ha';
      } else {
        displayArea = areaM2.toFixed(2);
        unit = 'm²';
      }
      
      this.addToHistory('Polygon-Fläche', `${displayArea} ${unit}`);
      UIHelpers.showToast(`Polygon-Fläche: ${displayArea} ${unit}`, 'success');
    }
    
    this.resetCurrentMeasurement();
  }

  cancelCurrentMeasurement() {
    this.clearEntities();
    this.resetCurrentMeasurement();
  }

  resetCurrentMeasurement() {
    this.activePoints = [];
    this.currentMeasurement = null;
    this.updateDisplay();
  }

  clearEntities() {
    if (this.viewer && this.measurementEntities) {
      this.measurementEntities.forEach(entity => {
        this.viewer.entities.remove(entity);
      });
      this.measurementEntities = [];
    }
  }

  clearAll() {
    if (confirm('Alle Messungen löschen?')) {
      this.clearEntities();
      this.measurementHistory = [];
      this.updateHistoryDisplay();
      this.resetCurrentMeasurement();
      UIHelpers.showToast('Alle Messungen gelöscht', 'success');
    }
  }

  updateDisplay() {
    UIHelpers.toggleVisibility('currentMeasurement', this.activePoints.length > 0);
  }
}

// ===========================
// Hidden Features System
// ===========================
class HiddenFeaturesSystem {
  constructor() {
    this.features = [];
    this.isHideMode = false;
  }

  toggleHideMode() {
    this.isHideMode = !this.isHideMode;
    
    const btn = Utils.getElement("toggleHideMode");
    const indicator = Utils.getElement("hideModeIndicator");
    const cesiumContainer = Utils.getElement("cesiumContainer");
    
    if (this.isHideMode) {
      if (btn) {
        btn.textContent = "🛑 Stoppen";
        btn.className = "btn btn-danger btn-small";
      }
      UIHelpers.toggleVisibility("hideModeIndicator", true);
      if (cesiumContainer) cesiumContainer.classList.add("hide-mode");
      
      UIHelpers.showToast("Hide-Modus aktiviert - Klicken Sie auf Features zum Verstecken", 'info', 3000);
    } else {
      if (btn) {
        btn.textContent = "🎯 Hide-Modus";
        btn.className = "btn btn-primary btn-small";
      }
      UIHelpers.toggleVisibility("hideModeIndicator", false);
      if (cesiumContainer) cesiumContainer.classList.remove("hide-mode");
      
      UIHelpers.showToast("Hide-Modus deaktiviert", 'info', 2000);
    }
  }

  handleClick(click, viewer) {
    const feature = viewer.scene.pick(click.position);
    
    if (feature instanceof Cesium.Cesium3DTileFeature) {
      this.hideFeature(feature);
      UIHelpers.showToast(`Feature versteckt`, 'success', 2000);
    } else {
      UIHelpers.showToast('Kein Feature zum Verstecken gefunden', 'warning', 2000);
    }
  }

  hideFeature(feature) {
    if (!feature || !(feature instanceof Cesium.Cesium3DTileFeature)) {
      return;
    }

    const name = feature.getProperty("name") || "Unbenannt";
    const objektId = feature.getProperty("_213WehranlagenObjektIdentNr") || 
                     feature.getProperty("id") || 
                     Date.now().toString();

    feature.show = false;

    const hiddenFeature = {
      feature: feature,
      name: name,
      id: objektId,
      timestamp: new Date().toISOString()
    };

    this.features.push(hiddenFeature);
    this.updateDisplay();
    
    const panel = Utils.getElement("hiddenFeaturesPanel");
    if (panel && panel.style.display === "none") {
      UIHelpers.toggleVisibility("hiddenFeaturesPanel", true);
    }

    UIHelpers.showToast(`Feature "${name}" versteckt`, 'success', 2000);
  }

  showFeature(hiddenFeature) {
    if (hiddenFeature.feature) {
      hiddenFeature.feature.show = true;
      
      const index = this.features.indexOf(hiddenFeature);
      if (index > -1) {
        this.features.splice(index, 1);
      }
      
      this.updateDisplay();
      UIHelpers.showToast(`Feature "${hiddenFeature.name}" wiederhergestellt`, 'success', 2000);
    }
  }

  showFeatureByIndex(index) {
    const hiddenFeature = this.features[index];
    if (hiddenFeature) {
      this.showFeature(hiddenFeature);
    }
  }

  showAll() {
    const count = this.features.length;
    
    this.features.forEach(hiddenFeature => {
      if (hiddenFeature.feature) {
        hiddenFeature.feature.show = true;
      }
    });
    
    this.features = [];
    this.updateDisplay();
    
    if (count > 0) {
      UIHelpers.showToast(`${count} Features wiederhergestellt`, 'success', 3000);
    }
  }

  updateDisplay() {
    const list = Utils.getElement("hiddenFeaturesList");
    if (!list) return;
    
    if (this.features.length === 0) {
      list.innerHTML = `
        <div class="no-hidden-features">
          Keine versteckten Features.<br>
          <small>Nutzen Sie den Hide-Modus oder verstecken Sie Features über die Info-Box.</small>
        </div>
      `;
      return;
    }
    
    const container = document.createElement('div');
    
    this.features.forEach((hiddenFeature, index) => {
      const time = new Date(hiddenFeature.timestamp).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const itemDiv = document.createElement('div');
      itemDiv.className = 'hidden-feature-item';
      itemDiv.dataset.index = index;
      
      itemDiv.innerHTML = `
        <div class="hidden-feature-info">
          <div class="hidden-feature-name">${hiddenFeature.name}</div>
          <div class="hidden-feature-id">ID: ${hiddenFeature.id} • ${time}</div>
        </div>
        <button class="btn btn-success btn-small" data-action="show" data-index="${index}">
          👁️ Zeigen
        </button>
      `;
      
      container.appendChild(itemDiv);
    });
    
    // Event delegation for show buttons
    container.addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action="show"]');
      if (button) {
        const index = parseInt(button.dataset.index);
        window.cesiumApp.hiddenFeatures.showFeatureByIndex(index);
      }
    });
    
    list.innerHTML = '';
    list.appendChild(container);
  }
}

// Export for use in other modules
window.BAWUtils = {
  config: BAWConfig,
  utils: Utils,
  ui: UIHelpers,
  MeasurementSystem,
  HiddenFeaturesSystem
};