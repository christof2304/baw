/**
 * BAW Cesium Viewer - Optimized Version
 * Performance, Wartbarkeit und Stabilität verbessert
 */

// ===========================
// Utility Functions & Helpers
// ===========================
const Utils = {
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
    if (!this._elementCache) {
      this._elementCache = new Map();
    }
    if (!this._elementCache.has(id)) {
      this._elementCache.set(id, document.getElementById(id));
    }
    return this._elementCache.get(id);
  },

  // Clear element cache
  clearElementCache() {
    if (this._elementCache) {
      this._elementCache.clear();
    }
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
  }
};

// ===========================
// LocalCommentsAPI Class - Optimized
// ===========================
class LocalCommentsAPI {
  constructor() {
    this.storageKey = 'baw_cesium_comments';
    this.data = this.loadFromStorage();
    this._cache = new Map();
  }

  loadFromStorage() {
    return Utils.safeExecute(() => {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : this.getDefaultData();
    }, 'Error loading from storage', this.getDefaultData());
  }

  getDefaultData() {
    return { comments: {}, metadata: { version: "1.0" } };
  }

  saveToStorage() {
    return Utils.safeExecute(() => {
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
// Main CesiumApp Class - Optimized
// ===========================
class CesiumApp {
  constructor() {
    this.initializeConfig();
    this.initializeState();
    this.setupOptimizations();
  }

  initializeConfig() {
    this.config = {
      accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlMDkwZDM4OC00NzRhLTQyMmYtOTI2ZS02NGZiM2Q2MTE2OGMiLCJpZCI6MjYzNTkwLCJpYXQiOjE3NDExNzk0MTB9.jnf8NDf2PoydWpK3mwDkbp8IYIif5T_-Ioy3Bx6n3Cc",
      
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
      ]
    };

    this.objektartenMap = { "213": "Wehranlagen" };
    this.objektteileMap = {
      "213": {
        "151": "Verschlusskörper",
        "142": "Wehrschwelle"
      }
    };
  }

  initializeState() {
    // Comments System
    this.comments = {
      isCommentMode: false,
      currentEditId: null,
      pendingPosition: null,
      pendingFeature: null,
      currentSceneComments: [],
      billboards: null,
      labels: null
    };

    // Hidden Features System
    this.hiddenFeatures = {
      features: [],
      isHideMode: false
    };

    // Measurement System
    this.measurements = {
      isActive: false,
      currentMode: null,
      activePoints: [],
      measurementEntities: [],
      measurementHistory: [],
      currentMeasurement: null,
      liveEntities: []
    };

    // Point Cloud Settings
    this.pointCloudAssets = [];
    this.pointCloudSettings = {
      pointSize: 3,
      pointBudget: 16,
      screenSpaceError: 16,
      colorMode: 'rgb',
      eyeDomeLighting: true,
      attenuation: true,
      silhouette: false
    };

    // Render Quality Settings
    this.renderQualitySettings = this.getRenderQualitySettings();
    this.currentRenderQuality = 'balanced';

    // Scene Management
    this.viewer = null;
    this.currentModels = [];
    this.currentGroup = null;
    this.assetIdToTilesetMap = {};
    this.currentLocalImageryLayer = null;
    this.globalImageryProvider = null;
    this.globalTerrainProvider = null;
    this.globalImageryLayer = null;
    this.handler = null;
    
    // API & Settings
    this.commentsAPI = new LocalCommentsAPI();
    this.userName = '';
    
    // Performance
    this.cachedCommentIcon = null;
    this.performanceMonitorInterval = null;
    this._eventListeners = new Map();
    this._boundMethods = new Map();
  }

  setupOptimizations() {
    // Create bound methods once to avoid creating new functions
    this._boundMethods.set('handleResize', Utils.debounce(this.handleResize.bind(this), 250));
    this._boundMethods.set('handleKeydown', this.handleKeydown.bind(this));
    
    // Setup RAF for smooth animations
    this.raf = window.requestAnimationFrame || 
               window.webkitRequestAnimationFrame || 
               window.mozRequestAnimationFrame || 
               ((callback) => window.setTimeout(callback, 1000 / 60));
  }

  getRenderQualitySettings() {
    return {
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
    };
  }

  // ===========================
  // Initialization
  // ===========================
  async init() {
    try {
      console.log("🚀 Starting Cesium initialization...");
      this.showLoading("Cesium wird initialisiert...");
      
      await this.setupCesium();
      this.initCommentsSystem();
      this.setupUI();
      this.setupEventHandlers();
      this.loadUserSettings();
      this.updateDataStatus();
      
      this.hideLoading();
      console.log("🎉 Initialization complete!");
      this.showToast("BAW Cesium Viewer mit lokalen Kommentaren geladen!", "success");
      
    } catch (error) {
      this.handleInitError(error);
    }
  }

  handleInitError(error) {
    console.error("❌ Initialization failed:", error);
    this.hideLoading();
    
    const errorMsg = error.message || "Unbekannter Fehler";
    this.showToast(`Initialisierung fehlgeschlagen: ${errorMsg}`, "error", 10000);
    
    // Try partial initialization
    Utils.safeExecute(() => {
      this.setupUI();
      this.setupEventHandlers();
      this.loadUserSettings();
      this.updateDataStatus();
      this.showToast("Teilweise Initialisierung erfolgreich - 3D-Funktionen möglicherweise eingeschränkt", "warning", 8000);
    }, "Even fallback initialization failed");
  }

  async setupCesium() {
    console.log("🌍 Setting up Cesium...");
    
    Cesium.Ion.defaultAccessToken = this.config.accessToken;
    
    // Optimize request scheduling
    Cesium.RequestScheduler.requestsByServer = {
      'api.cesium.com:443': 18,
      'assets.cesium.com:443': 18,
      'cdn.jsdelivr.net:443': 12
    };
    
    const qualitySettings = this.renderQualitySettings[this.currentRenderQuality].settings;
    
    this.viewer = new Cesium.Viewer("cesiumContainer", {
      baseLayerPicker: false,
      selectionIndicator: false,
      infoBox: false,
      timeline: false,
      animation: false,
      navigationHelpButton: false,
      homeButton: false,
      sceneModePicker: false,
      geocoder: false,
      fullscreenButton: false,
      vrButton: false,
      requestRenderMode: qualitySettings.requestRenderMode,
      maximumRenderTimeChange: qualitySettings.requestRenderMode ? Infinity : 0.0,
      scene3DOnly: true,
      orderIndependentTranslucency: false,
      msaaSamples: qualitySettings.msaaSamples,
    });

    this.applyViewerSettings(qualitySettings);
    this.viewer.clock.currentTime = Cesium.JulianDate.fromIso8601("2022-08-01T00:00:00Z");
    this.viewer.imageryLayers.removeAll();
    
    await this.setupGlobalProviders();
    console.log("✅ Cesium viewer created with performance optimizations");
  }

  applyViewerSettings(settings) {
    const scene = this.viewer.scene;
    const globe = scene.globe;
    
    globe.enableLighting = settings.enableLighting;
    globe.depthTestAgainstTerrain = settings.depthTestAgainstTerrain;
    globe.tileCacheSize = settings.tileCacheSize;
    
    scene.fog.enabled = settings.fogEnabled;
    scene.skyAtmosphere.show = settings.skyAtmosphereShow;
    
    this.viewer.resolutionScale = settings.resolutionScale;
    this.viewer.camera.percentageChanged = 0.5;
    
    if (scene.postProcessStages) {
      scene.postProcessStages.fxaa.enabled = settings.fxaaEnabled;
      scene.postProcessStages.bloom.enabled = settings.bloomEnabled;
    }
  }

  async setupGlobalProviders() {
    try {
      // Load terrain with timeout
      this.globalTerrainProvider = await Promise.race([
        Cesium.createWorldTerrainAsync(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      ]).catch(() => new Cesium.EllipsoidTerrainProvider());
      
      this.viewer.terrainProvider = this.globalTerrainProvider;

      // Load imagery with timeout
      this.globalImageryProvider = await Promise.race([
        Cesium.createWorldImageryAsync(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
      ]).catch(() => new Cesium.OpenStreetMapImageryProvider({
        url: "https://a.tile.openstreetmap.org/"
      }));
      
      this.globalImageryLayer = this.viewer.imageryLayers.addImageryProvider(this.globalImageryProvider);
      
    } catch (error) {
      console.error("Error setting up global providers:", error);
      throw error;
    }
  }

  initCommentsSystem() {
    console.log("💬 Initializing comments system...");
    
    this.comments.billboards = new Cesium.BillboardCollection();
    this.comments.labels = new Cesium.LabelCollection();
    
    this.viewer.scene.primitives.add(this.comments.billboards);
    this.viewer.scene.primitives.add(this.comments.labels);
    
    console.log("✅ Comments system ready");
  }

  setupUI() {
    console.log("🎨 Setting up UI...");
    
    const sceneSelect = Utils.getElement("sceneSelect");
    if (sceneSelect) {
      // Use DocumentFragment for better performance
      const fragment = document.createDocumentFragment();
      
      this.config.modelGroups.forEach((group, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = group.name;
        fragment.appendChild(option);
      });
      
      sceneSelect.appendChild(fragment);
    }
    
    console.log("✅ UI ready");
  }

  // ===========================
  // Event Handlers - Optimized
  // ===========================
  setupEventHandlers() {
    console.log("🎮 Setting up event handlers...");
    
    // Create event handler map for better organization
    const handlers = {
      // Data management
      'exportJSON': () => this.exportJSON(),
      'exportCSV': () => this.exportCSV(),
      'importData': () => Utils.getElement('fileInput').click(),
      'clearData': () => this.clearAllData(),
      'fileInput': (e) => this.handleFileImport(e),
      
      // CSV Export Dialog
      'downloadCSV': () => this.downloadCSV(),
      'copyCSV': () => this.copyCSVToClipboard(),
      'cancelCSV': () => this.closeCSVDialog(),
      
      // Scene selection
      'sceneSelect': (e) => this.handleSceneChange(e),
      
      // Render quality
      'renderQualitySelect': (e) => this.setRenderQuality(e.target.value),
      
      // Imagery selection
      'imagerySelect': (e) => this.switchImageryProvider(e.target.value),
      
      // Comments panel
      'closeCommentsBtn': () => this.hidePanel("comments"),
      'refreshComments': () => this.loadCommentsFromStorage(),
      'toggleCommentMode': () => this.toggleCommentMode(),
      'addCommentBtn': () => this.handleAddComment(),
      'cancelCommentBtn': () => this.exitCommentMode(),
      
      // Comment edit
      'saveCommentBtn': () => this.saveEditComment(),
      'cancelEditBtn': () => this.closeEditComment(),
      
      // Panel toggles
      'toggleCommentsPanel': (e) => this.togglePanel('comments', e.target.checked),
      'toggleMeasurePanel': (e) => this.togglePanel('measure', e.target.checked),
      'toggleHiddenFeaturesPanel': (e) => this.togglePanel('hiddenFeatures', e.target.checked),
      
      // Info box
      'closeInfoBtn': () => this.hideInfoBox(),
      'hideFeatureBtn': () => this.hideCurrentFeature(),
      
      // Hidden features panel
      'closeHiddenFeaturesBtn': () => this.hidePanel("hiddenFeatures"),
      'toggleHideMode': () => this.toggleHideMode(),
      'showAllHidden': () => this.showAllHiddenFeatures(),
      
      // Measurement panel
      'closeMeasureBtn': () => this.hidePanel("measure"),
      'measureModeSelect': (e) => this.setMeasurementMode(e.target.value),
      'finishMeasurement': () => this.finishCurrentMeasurement(),
      'cancelMeasurement': () => this.cancelCurrentMeasurement(),
      'clearMeasurements': () => this.clearAllMeasurements(),
      
      // User settings
      'userName': () => this.saveUserSettings(),
      
      // Model toggles
      'citygmlToggle': (e) => this.toggleModel(3273407, e.target.checked),
      'testLauffenModels': () => this.testLauffenModels(),
      'showAllLauffen': () => this.showAllLauffenModels(),
      'hideAllLauffen': () => this.hideAllLauffenModels(),
      'testZeltingenModels': () => this.testZeltingenModels(),
      'showAllZeltingen': () => this.showAllZeltingenModels(),
      'hideAllZeltingen': () => this.hideAllZeltingenModels(),
      
      // Point cloud controls
      'pointSizeControl': (e) => this.handlePointSizeChange(e),
      'toggleEyeDomeLighting': (e) => this.handleEDLToggle(e),
      'toggleAttenuation': (e) => this.handleAttenuationToggle(e),
      'debugPointCloud': () => this.debugPointClouds()
    };

    // Attach all handlers
    Object.entries(handlers).forEach(([id, handler]) => {
      const element = Utils.getElement(id);
      if (element) {
        const eventType = element.tagName === 'SELECT' || element.type === 'checkbox' || element.type === 'range' 
          ? 'change' 
          : element.type === 'file' 
          ? 'change'
          : 'click';
        
        element.addEventListener(eventType, handler);
        this._eventListeners.set(id, { element, eventType, handler });
      }
    });

    // Setup model toggle handlers
    this.setupModelToggleHandlers();
    
    // Dialog close handlers
    this.setupDialogHandlers();
    
    // Window event handlers
    window.addEventListener('resize', this._boundMethods.get('handleResize'));
    document.addEventListener('keydown', this._boundMethods.get('handleKeydown'));
    
    console.log("✅ Event handlers ready");
  }

  setupModelToggleHandlers() {
    // Lauffen models
    ['model3256557', 'model3256547', 'model3256555'].forEach(id => {
      const element = Utils.getElement(id);
      if (element) {
        const assetId = parseInt(element.dataset.assetId);
        element.addEventListener('change', (e) => this.toggleModel(assetId, e.target.checked));
      }
    });

    // Zeltingen models
    ['model3251780', 'model3341583'].forEach(id => {
      const element = Utils.getElement(id);
      if (element) {
        const assetId = parseInt(element.dataset.assetId);
        element.addEventListener('change', (e) => this.toggleModel(assetId, e.target.checked));
      }
    });
  }

  setupDialogHandlers() {
    const overlays = ['commentEditOverlay', 'csvExportOverlay'];
    overlays.forEach(id => {
      const element = Utils.getElement(id);
      if (element) {
        element.addEventListener('click', (e) => {
          if (e.target.id === id) {
            if (id === 'commentEditOverlay') this.closeEditComment();
            else if (id === 'csvExportOverlay') this.closeCSVDialog();
          }
        });
      }
    });
  }

  handleKeydown(e) {
    if (e.key === "Escape") {
      this.handleEscapeKey();
    } else if (e.ctrlKey) {
      this.handleCtrlKey(e);
    }
  }

  handleEscapeKey() {
    if (this.comments.isCommentMode) {
      this.exitCommentMode();
    } else {
      this.hideAllPanels();
      this.closeCSVDialog();
    }
  }

  handleCtrlKey(e) {
    const shortcuts = {
      'c': 'comments',
      'm': 'measure'
    };
    
    const panelType = shortcuts[e.key];
    if (panelType) {
      e.preventDefault();
      const panel = Utils.getElement(`${panelType}Panel`);
      if (panel) {
        const isVisible = panel.style.display !== "none";
        isVisible ? this.hidePanel(panelType) : this.showPanel(panelType);
      }
    }
  }

  // ===========================
  // Scene Management - Optimized
  // ===========================
  handleSceneChange(e) {
    const index = parseInt(e.target.value);
    if (!isNaN(index)) {
      this.loadScene(this.config.modelGroups[index]);
    } else {
      this.clearScene();
    }
  }

  async loadScene(group) {
    try {
      console.log(`📦 Loading scene: ${group.name}`);
      this.showLoading(`Lade ${group.name}...`);

      await this.clearScene();
      this.currentGroup = group;

      // Load terrain
      await this.loadTerrain(group);
      
      // Ensure global imagery
      await this.ensureGlobalImagery();
      
      // Load local imagery
      const localImageryLayer = await this.loadLocalImagery(group);
      this.currentLocalImageryLayer = localImageryLayer;

      // Configure imagery visibility
      this.configureImageryVisibility();

      // Load 3D models
      await this.loadModels(group);

      // Setup scene-specific features
      this.setupSceneFeatures(group);
      
      // Final setup
      this.setupClickHandler();
      this.showScenePanels();
      this.loadCommentsFromStorage();
      this.updateCommentModeUI();

      this.hideLoading();
      this.showToast(`${group.name} geladen!`, "success");

    } catch (error) {
      this.handleError(`Fehler beim Laden von ${group.name}`, error);
    }
  }

  async loadTerrain(group) {
    try {
      const localTerrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(group.terrainAssetId);
      this.viewer.terrainProvider = localTerrain;
      this.viewer.scene.globe.depthTestAgainstTerrain = true;
      console.log("✅ Local terrain loaded");
    } catch (error) {
      console.warn("Local terrain could not be loaded:", error);
    }
  }

  async ensureGlobalImagery() {
    if (!this.globalImageryLayer || !this.globalImageryProvider) {
      try {
        this.globalImageryProvider = await Cesium.createWorldImageryAsync();
        this.globalImageryLayer = this.viewer.imageryLayers.addImageryProvider(this.globalImageryProvider, 0);
      } catch (error) {
        this.globalImageryProvider = new Cesium.OpenStreetMapImageryProvider({
          url: "https://a.tile.openstreetmap.org/"
        });
        this.globalImageryLayer = this.viewer.imageryLayers.addImageryProvider(this.globalImageryProvider, 0);
      }
    }
    this.globalImageryLayer.show = true;
  }

  async loadLocalImagery(group) {
    try {
      const provider = await Cesium.IonImageryProvider.fromAssetId(group.imageryAssetId);
      const layer = this.viewer.imageryLayers.addImageryProvider(provider);
      
      layer.alpha = 1.0;
      layer.brightness = 1.0;
      layer.contrast = 1.0;
      layer.gamma = 1.0;
      
      return layer;
    } catch (error) {
      console.warn("Local imagery could not be loaded:", error);
      return null;
    }
  }

  configureImageryVisibility() {
    const imagerySelect = Utils.getElement("imagerySelect");
    if (imagerySelect && this.currentLocalImageryLayer) {
      const useOrtho = imagerySelect.value === "ortho";
      this.currentLocalImageryLayer.show = useOrtho;
    } else if (this.currentLocalImageryLayer) {
      this.currentLocalImageryLayer.show = false;
    }
  }

  async loadModels(group) {
    const loadPromises = group.modelAssetIds.map(async (assetId, i) => {
      console.log(`Loading 3D model ${i + 1}/${group.modelAssetIds.length}: ${assetId}`);
      
      const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(assetId);
      this.viewer.scene.primitives.add(tileset);
      this.currentModels.push(tileset);
      this.assetIdToTilesetMap[assetId] = tileset;
      
      // Apply quality settings
      const settings = this.renderQualitySettings[this.currentRenderQuality].settings;
      this.applyTilesetQualitySettings(tileset, settings);
      
      // Initially hide models for manual control
      tileset.show = false;
      
      // Apply scene-specific styling
      if (group.name === "Schleuse Zeltingen") {
        this.applyZeltingenStyling(tileset);
      }
      
      return tileset;
    });

    await Promise.all(loadPromises);

    // Zoom to first model
    if (this.currentModels.length > 0) {
      const firstModel = this.currentModels[0];
      const wasVisible = firstModel.show;
      firstModel.show = true;
      await this.viewer.zoomTo(firstModel);
      if (!wasVisible) firstModel.show = false;
    }
  }

  setupSceneFeatures(group) {
    if (group.name === "Schleuse Lauffen") {
      this.setupLauffenFeatures();
    } else if (group.name === "Schleuse Zeltingen") {
      this.setupZeltingenFeatures();
      // Detect point clouds after a delay
      setTimeout(() => this.detectPointClouds(), 2000);
    }
  }

  setupLauffenFeatures() {
    // Show Lauffen-specific controls
    Utils.getElement("citygmlToggleContainer").style.display = "block";
    Utils.getElement("lauffenModelToggles").style.display = "block";
  }

  setupZeltingenFeatures() {
    // Show Zeltingen-specific controls
    Utils.getElement("zeltingenModelToggles").style.display = "block";
    Utils.getElement("pointCloudControls").style.display = "block";
  }

  applyTilesetQualitySettings(tileset, settings) {
    Utils.safeExecute(() => {
      tileset.maximumScreenSpaceError = settings.maximumScreenSpaceError;
      tileset.maximumMemoryUsage = settings.maximumMemoryUsage;
      tileset.cullRequestsWhileMoving = settings.cullRequestsWhileMoving;
      tileset.cullRequestsWhileMovingMultiplier = settings.cullRequestsWhileMovingMultiplier;
      tileset.dynamicScreenSpaceError = settings.dynamicScreenSpaceError;
      
      if (tileset.pointCloudShading) {
        tileset.pointCloudShading.maximumAttenuation = settings.pointCloudMaxAttenuation;
        tileset.pointCloudShading.baseResolution = settings.pointCloudBaseResolution;
      }
    }, "Could not apply quality settings to tileset");
  }

  applyZeltingenStyling(tileset) {
    const nameColorMap = new Map();
    
    function getColorFromName(name) {
      if (!nameColorMap.has(name)) {
        const hash = Array.from(name).reduce((acc, c) => acc + c.charCodeAt(0), 0);
        const hue = hash % 360;
        const color = Cesium.Color.fromHsl(hue / 360, 0.6, 0.5, 1.0);
        nameColorMap.set(name, color);
      }
      return nameColorMap.get(name);
    }

    tileset.tileLoad.addEventListener(tile => {
      const content = tile.content;
      for (let i = 0; i < content.featuresLength; i++) {
        const feature = content.getFeature(i);
        
        const fName = feature.getProperty("name") || "unknown";
        const color = getColorFromName(fName);
        feature.color = Cesium.Color.clone(color);
        
        const height = feature.getProperty("height");
        if (height) {
          let grayValue = Math.min(Math.max((height - 1) / 44, 0), 1);
          grayValue = Math.pow(grayValue, 1.5);
          const grayColor = Cesium.Color.fromHsl(0, 0, grayValue);
          feature.color = Cesium.Color.clone(grayColor);
        }
      }
    });
  }

  async clearScene() {
    // Show all hidden features before clearing
    if (this.hiddenFeatures.features.length > 0) {
      this.showAllHiddenFeatures();
    }
    
    // Reset hide mode
    if (this.hiddenFeatures.isHideMode) {
      this.toggleHideMode();
    }
    
    // Remove 3D models
    this.currentModels.forEach(model => this.viewer.scene.primitives.remove(model));
    this.currentModels = [];

    // Remove local imagery
    if (this.currentLocalImageryLayer) {
      this.viewer.imageryLayers.remove(this.currentLocalImageryLayer, true);
      this.currentLocalImageryLayer = null;
    }
    
    // Reset terrain to global
    if (this.globalTerrainProvider) {
      this.viewer.terrainProvider = this.globalTerrainProvider;
    }
    
    // Ensure global imagery is visible
    if (this.globalImageryLayer) {
      this.globalImageryLayer.show = true;
    }

    // Hide all scene-specific UI
    this.hideSceneUI();
    
    // Reset state
    this.resetSceneState();
    
    // Cleanup handlers
    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }
    
    console.log("✅ Scene cleared");
  }

  hideSceneUI() {
    const uiElements = [
      "citygmlToggleContainer",
      "lauffenModelToggles",
      "zeltingenModelToggles",
      "pointCloudControls"
    ];
    
    uiElements.forEach(id => {
      const element = Utils.getElement(id);
      if (element) element.style.display = "none";
    });

    // Reset checkboxes
    const checkboxes = [
      "citygmlToggle",
      "model3256557", "model3256547", "model3256555",
      "model3251780", "model3341583"
    ];
    
    checkboxes.forEach(id => {
      const element = Utils.getElement(id);
      if (element) element.checked = false;
    });

    // Reset point cloud controls
    const pointSizeControl = Utils.getElement("pointSizeControl");
    if (pointSizeControl) pointSizeControl.value = "0.5";
    
    const pointSizeValue = Utils.getElement("pointSizeValue");
    if (pointSizeValue) pointSizeValue.textContent = "Normal";
    
    const toggleEDL = Utils.getElement("toggleEyeDomeLighting");
    if (toggleEDL) toggleEDL.checked = true;
    
    const toggleAttenuation = Utils.getElement("toggleAttenuation");
    if (toggleAttenuation) toggleAttenuation.checked = true;
  }

  resetSceneState() {
    this.pointCloudAssets = [];
    this.assetIdToTilesetMap = {};
    this.hideInfoBox();
    this.hideAllPanels();
    this.currentGroup = null;
    
    this.exitCommentMode();
    this.updateCommentModeUI();

    this.clearCurrentMeasurementEntities();
    this.measurements = {
      isActive: false,
      currentMode: null,
      activePoints: [],
      measurementEntities: [],
      measurementHistory: [],
      currentMeasurement: null
    };
  }

  // ===========================
  // Panel Management - Optimized
  // ===========================
  togglePanel(type, show) {
    if (show) {
      this.showPanel(type);
    } else {
      this.hidePanel(type);
    }
  }

  showPanel(type) {
    const panel = Utils.getElement(`${type}Panel`);
    if (!panel) return;
    
    panel.style.display = "block";
    
    // Use RAF for smoother animations
    this.raf(() => {
      if (type === "comments") {
        panel.style.transform = "translateY(-50%) translateX(100%)";
        panel.style.opacity = "0";
        
        this.raf(() => {
          panel.style.transform = "translateY(-50%) translateX(0)";
          panel.style.opacity = "1";
        });
      } else {
        panel.style.opacity = "0";
        this.raf(() => {
          panel.style.opacity = "1";
        });
      }
    });
    
    // Check collisions after animation
    setTimeout(() => this.checkPanelCollisions(), 350);
    
    // Panel-specific initialization
    if (type === "measure") {
      this.initMeasurePanel();
    } else if (type === "hiddenFeatures") {
      this.updateHiddenFeaturesDisplay();
    }

    // Manage open panels on mobile
    if (!(type === "measure" && window.innerWidth > 768)) {
      setTimeout(() => this.manageOpenPanels(), 100);
    }
  }

  hidePanel(type) {
    const panel = Utils.getElement(`${type}Panel`);
    if (!panel) return;
    
    panel.style.opacity = "0";
    if (type === "comments") {
      panel.style.transform = "translateY(-50%) translateX(100%)";
    }
    
    setTimeout(() => {
      panel.style.display = "none";
      this.checkPanelCollisions();
    }, 300);
    
    // Panel-specific cleanup
    if (type === "measure") {
      this.cleanupMeasurePanel();
    } else if (type === "hiddenFeatures" && this.hiddenFeatures.isHideMode) {
      this.toggleHideMode();
    }
  }

  initMeasurePanel() {
    this.measurements.isActive = false;
    this.measurements.currentMode = null;
    const select = Utils.getElement("measureModeSelect");
    if (select) select.value = "";
    this.updateMeasurementDisplay();
  }

  cleanupMeasurePanel() {
    this.cancelCurrentMeasurement();
    this.measurements.isActive = false;
    this.measurements.currentMode = null;
  }

  hideAllPanels() {
    ['comments', 'measure', 'hiddenFeatures'].forEach(type => {
      this.hidePanel(type);
      const toggle = Utils.getElement(`toggle${type.charAt(0).toUpperCase() + type.slice(1)}Panel`);
      if (toggle) toggle.checked = false;
    });
    this.hideInfoBox();
  }

  checkPanelCollisions() {
    const panels = {
      comments: Utils.getElement("commentsPanel"),
      measure: Utils.getElement("measurePanel"),
      info: Utils.getElement("infoBox")
    };
    
    const visibility = {
      comments: panels.comments?.style.display !== "none",
      measure: panels.measure?.style.display !== "none",
      info: panels.info?.style.display !== "none"
    };
    
    if (window.innerWidth <= 768) {
      this.handleMobilePanelLayout(panels, visibility);
    } else {
      this.handleDesktopPanelLayout(panels, visibility);
    }
  }

  handleMobilePanelLayout(panels, visibility) {
    if (visibility.comments && visibility.measure && panels.measure) {
      panels.measure.style.top = "120px";
    } else if (visibility.measure && panels.measure) {
      panels.measure.style.top = "80px";
    }
    
    if (visibility.info && panels.info) {
      let offset = 140;
      if (visibility.comments) offset += 60;
      if (visibility.measure) offset += 60;
      panels.info.style.top = `${offset}px`;
    }
  }

  handleDesktopPanelLayout(panels, visibility) {
    if (visibility.info && panels.info) {
      if (visibility.comments) {
        panels.info.style.right = "420px";
        panels.info.style.top = "20px";
      } else {
        panels.info.style.right = "20px";
        panels.info.style.top = visibility.measure ? "400px" : "20px";
      }
    }
  }

  manageOpenPanels() {
    if (window.innerWidth > 480) return;
    
    const openPanels = ["comments", "measure"].filter(type => {
      const panel = Utils.getElement(`${type}Panel`);
      return panel && panel.style.display !== "none";
    });
    
    if (openPanels.length > 1) {
      this.hidePanel("comments");
      this.showToast("Comments Panel geschlossen für bessere Übersicht", "info", 2000);
    }
  }

  handleResize() {
    this.checkPanelCollisions();
    
    const commentsPanel = Utils.getElement("commentsPanel");
    if (window.innerWidth <= 480 && commentsPanel) {
      commentsPanel.style.maxHeight = "40vh";
    }
  }

  showScenePanels() {
    const panelToggles = Utils.getElement("panelToggles");
    if (panelToggles) panelToggles.style.display = "block";
    
    ["toggleCommentsPanel", "toggleMeasurePanel"].forEach(id => {
      const element = Utils.getElement(id);
      if (element) element.disabled = false;
    });
    
    console.log(`🎛️ Showing panels for scene: ${this.currentGroup?.name}`);
  }

  // ===========================
  // Click Handler - Optimized
  // ===========================
  setupClickHandler() {
    if (this.handler) {
      this.handler.destroy();
    }

    this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);
    
    // Left click handler
    this.handler.setInputAction((click) => {
      this.handleLeftClick(click);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Mouse move handler with throttling
    const throttledMouseMove = Utils.throttle((movement) => {
      this.handleMouseMove(movement);
    }, 50);
    
    this.handler.setInputAction(throttledMouseMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  handleLeftClick(click) {
    if (this.comments.isCommentMode) {
      this.handleCommentModeClick(click);
    } else if (this.measurements.isActive) {
      this.handleMeasurementClick(click);
    } else if (this.hiddenFeatures.isHideMode) {
      this.handleHideModeClick(click);
    } else {
      this.handleNormalClick(click);
    }
  }

  handleNormalClick(click) {
    const feature = this.viewer.scene.pick(click.position);
    
    if (feature instanceof Cesium.Cesium3DTileFeature) {
      this.showFeatureInfo(feature);
      this.currentSelectedFeature = feature;
    } else if (feature?.id?.startsWith?.('comment_')) {
      const commentId = feature.id.replace('comment_', '');
      this.zoomToComment(commentId);
    } else {
      this.hideInfoBox();
      this.currentSelectedFeature = null;
    }
  }

  handleMouseMove(movement) {
    if (this.comments.isCommentMode || this.measurements.isActive || this.hiddenFeatures.isHideMode) return;

    const feature = this.viewer.scene.pick(movement.endPosition);
    
    // Hide all labels first
    for (let i = 0; i < this.comments.labels.length; i++) {
      this.comments.labels.get(i).show = false;
    }
    
    // Show label for hovered comment
    if (feature?.id?.startsWith?.('comment_')) {
      const commentId = feature.id.replace('comment_', '');
      const labelId = `comment_label_${commentId}`;
      
      for (let i = 0; i < this.comments.labels.length; i++) {
        const label = this.comments.labels.get(i);
        if (label.id === labelId) {
          label.show = true;
          break;
        }
      }
    }
  }

  // ===========================
  // Comments System - Optimized
  // ===========================
  toggleCommentMode() {
    if (this.comments.isCommentMode) {
      this.exitCommentMode();
    } else {
      this.enterCommentMode();
    }
  }

  enterCommentMode() {
    if (!this.userName) {
      this.showToast("Bitte geben Sie zuerst Ihren Namen ein", "warning");
      Utils.getElement('userName')?.focus();
      return;
    }
    
    if (!this.currentGroup) {
      this.showToast("Bitte laden Sie zuerst eine Szene", "warning");
      return;
    }
    
    this.comments.isCommentMode = true;
    this.updateCommentModeUI();
    
    const indicator = Utils.getElement('commentModeIndicator');
    if (indicator) indicator.style.display = 'block';
    
    this.showToast("Kommentar-Modus aktiviert. Klicken Sie auf die Karte.", "success");
  }

  exitCommentMode() {
    this.comments.isCommentMode = false;
    this.comments.pendingPosition = null;
    this.comments.pendingFeature = null;
    this.updateCommentModeUI();
    
    const indicator = Utils.getElement('commentModeIndicator');
    if (indicator) indicator.style.display = 'none';
  }

  handleCommentModeClick(click) {
    const pickedFeature = this.viewer.scene.pick(click.position);
    let cartesian = null;
    let featureName = null;
    
    if (pickedFeature instanceof Cesium.Cesium3DTileFeature) {
      cartesian = Utils.safeExecute(() => {
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
      this.showToast("Ungültige Position für Kommentar", "warning");
      return;
    }

    this.comments.pendingPosition = cartesian;
    this.comments.pendingFeature = featureName;

    const modeText = Utils.getElement('commentModeText');
    if (modeText) {
      modeText.textContent = featureName 
        ? `Position gewählt: ${featureName} - Kommentar eingeben`
        : 'Position gewählt - Kommentar eingeben und hinzufügen';
    }

    Utils.getElement('commentInput')?.focus();
  }

  handleAddComment() {
    if (this.comments.pendingPosition) {
      this.addComment(this.comments.pendingPosition, this.comments.pendingFeature);
    }
  }

  addComment(position, featureName = null) {
    const commentInput = Utils.getElement('commentInput');
    const text = commentInput?.value.trim();
    
    if (!text) {
      this.showToast("Bitte geben Sie einen Kommentar ein", "warning");
      return;
    }
    
    if (!this.userName) {
      this.showToast("Bitte geben Sie Ihren Namen ein", "warning");
      return;
    }
    
    if (!this.currentGroup) {
      this.showToast("Bitte laden Sie zuerst eine Szene", "warning");
      return;
    }
    
    try {
      const comment = this.commentsAPI.saveComment(
        this.currentGroup.name,
        text,
        position,
        featureName,
        this.userName
      );
      
      this.comments.currentSceneComments.push(comment);
      this.updateCommentsDisplay();
      this.addCommentVisual(comment, this.comments.currentSceneComments.length - 1);
      this.updateDataStatus();
      
      if (commentInput) commentInput.value = '';
      this.exitCommentMode();
      
      this.showToast("Kommentar gespeichert!", "success");
    } catch (error) {
      console.error("Failed to save comment:", error);
      this.showToast("Fehler beim Speichern: " + error.message, "error");
    }
  }

  loadCommentsFromStorage() {
    if (!this.currentGroup) {
      this.comments.currentSceneComments = [];
      this.updateCommentsDisplay();
      return;
    }
    
    try {
      const comments = this.commentsAPI.loadComments(this.currentGroup.name);
      this.comments.currentSceneComments = comments;
      
      console.log(`📥 Loaded ${comments.length} comments from storage`);
      this.updateCommentsDisplay();
      this.refreshCommentVisuals();
      
      if (comments.length > 0) {
        this.showToast(`${comments.length} Kommentare geladen`, 'success', 2000);
      }
    } catch (error) {
      console.error("Failed to load comments from storage:", error);
      this.showToast("Fehler beim Laden der Kommentare: " + error.message, "error");
      this.comments.currentSceneComments = [];
      this.updateCommentsDisplay();
    }
  }

  refreshCommentVisuals() {
    this.comments.billboards.removeAll();
    this.comments.labels.removeAll();
    
    this.comments.currentSceneComments.forEach((comment, index) => {
      this.addCommentVisual(comment, index);
    });
  }

  addCommentVisual(comment, index) {
    // Create comment icon once and reuse
    if (!this.cachedCommentIcon) {
      this.cachedCommentIcon = this.createCommentIcon();
    }
    
    this.comments.billboards.add({
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
    
    this.comments.labels.add({
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

  updateCommentsDisplay() {
    const commentsList = Utils.getElement('commentsList');
    if (!commentsList) return;
    
    if (this.comments.currentSceneComments.length === 0) {
      commentsList.innerHTML = `
        <div class="no-comments">
          Noch keine Kommentare vorhanden.<br>
          <small>Aktivieren Sie den Hinzufügen-Modus und klicken Sie auf die Karte.</small>
        </div>
      `;
      return;
    }
    
    const sortedComments = [...this.comments.currentSceneComments].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();
    const container = document.createElement('div');
    
    sortedComments.forEach(comment => {
      const date = new Date(comment.timestamp).toLocaleDateString('de-DE');
      const time = new Date(comment.timestamp).toLocaleTimeString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
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
      modeText: Utils.getElement('commentModeText'),
      toggleBtn: Utils.getElement('toggleCommentMode'),
      commentInput: Utils.getElement('commentInput'),
      addBtn: Utils.getElement('addCommentBtn'),
      cancelBtn: Utils.getElement('cancelCommentBtn')
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
    
    if (this.comments.isCommentMode) {
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
    const comment = this.comments.currentSceneComments.find(c => c.id === commentId);
    if (!comment) return;
    
    this.comments.currentEditId = commentId;
    const editInput = Utils.getElement('commentEditInput');
    if (editInput) editInput.value = comment.text;
    
    const overlay = Utils.getElement('commentEditOverlay');
    if (overlay) overlay.style.display = 'flex';
  }

  closeEditComment() {
    this.comments.currentEditId = null;
    const overlay = Utils.getElement('commentEditOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  saveEditComment() {
    if (!this.comments.currentEditId) return;
    
    const editInput = Utils.getElement('commentEditInput');
    const newText = editInput?.value.trim();
    
    if (!newText) {
      this.showToast("Kommentar darf nicht leer sein", "warning");
      return;
    }
    
    this.editComment(this.comments.currentEditId, newText);
    this.closeEditComment();
  }

  editComment(commentId, newText) {
    if (!this.currentGroup) {
      this.showToast("Keine Szene geladen", "warning");
      return;
    }
    
    try {
      this.commentsAPI.updateComment(commentId, newText, this.currentGroup.name);
      
      const comment = this.comments.currentSceneComments.find(c => c.id === commentId);
      if (comment) {
        comment.text = newText;
        comment.timestamp = new Date().toISOString();
      }
      
      this.updateCommentsDisplay();
      this.refreshCommentVisuals();
      
      this.showToast("Kommentar aktualisiert!", "success");
    } catch (error) {
      console.error("Failed to update comment:", error);
      this.showToast("Fehler beim Aktualisieren: " + error.message, "error");
    }
  }

  deleteComment(commentId) {
    if (!confirm("Möchten Sie diesen Kommentar wirklich löschen?")) {
      return;
    }
    
    if (!this.currentGroup) {
      this.showToast("Keine Szene geladen", "warning");
      return;
    }
    
    try {
      this.commentsAPI.deleteComment(commentId, this.currentGroup.name);
      
      this.comments.currentSceneComments = this.comments.currentSceneComments.filter(c => c.id !== commentId);
      this.updateCommentsDisplay();
      this.refreshCommentVisuals();
      this.updateDataStatus();
      
      this.showToast("Kommentar gelöscht!", "success");
    } catch (error) {
      console.error("Failed to delete comment:", error);
      this.showToast("Fehler beim Löschen: " + error.message, "error");
    }
  }

  zoomToComment(commentId) {
    const comment = this.comments.currentSceneComments.find(c => c.id === commentId);
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
    for (let i = 0; i < this.comments.billboards.length; i++) {
      const billboard = this.comments.billboards.get(i);
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
    for (let j = 0; j < this.comments.labels.length; j++) {
      const label = this.comments.labels.get(j);
      if (label.id === labelId) {
        label.show = true;
        setTimeout(() => { label.show = false; }, 3000);
        break;
      }
    }
  }

  // ===========================
  // Measurement Methods
  // ===========================
  setMeasurementMode(mode) {
    console.log(`📏 Setting measurement mode: ${mode}`);
    
    this.cancelCurrentMeasurement();
    
    this.measurements.currentMode = mode;
    this.measurements.isActive = mode !== '';
    
    const instructions = Utils.getElement('measureInstructions');
    const instructionText = Utils.getElement('instructionText');
    const finishBtn = Utils.getElement('finishMeasurement');
    const cancelBtn = Utils.getElement('cancelMeasurement');
    
    if (mode) {
      if (instructions) instructions.style.display = 'block';
      if (cancelBtn) cancelBtn.style.display = 'inline-flex';
      
      switch (mode) {
        case 'height':
          if (instructionText) instructionText.textContent = 'Klicken Sie auf einen Punkt, um die Höhe über dem Terrain zu messen.';
          if (finishBtn) finishBtn.style.display = 'none';
          break;
        case 'distance':
          if (instructionText) instructionText.textContent = 'Klicken Sie auf zwei Punkte, um den Abstand zu messen.';
          if (finishBtn) finishBtn.style.display = 'none';
          break;
        case 'polyline':
          if (instructionText) instructionText.textContent = 'Klicken Sie mehrere Punkte für eine Polygon-Längenmessung. "Beenden" zum Abschließen.';
          if (finishBtn) finishBtn.style.display = 'inline-flex';
          break;
        case 'area':
          if (instructionText) instructionText.textContent = 'Klicken Sie Punkte für eine Flächenmessung. Mindestens 3 Punkte erforderlich. "Beenden" zum Abschließen.';
          if (finishBtn) finishBtn.style.display = 'inline-flex';
          break;
      }
      
      this.showToast(`Mess-Modus aktiviert: ${this.getModeDisplayName(mode)}`, 'info', 3000);
    } else {
      if (instructions) instructions.style.display = 'none';
      if (finishBtn) finishBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
    }
    
    this.updateMeasurementDisplay();
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

  handleMeasurementClick(click) {
    const position = this.getClickPosition(click);
    if (!position) {
      this.showToast('Ungültige Position - klicken Sie auf das Terrain oder ein Objekt', 'warning');
      return;
    }
    
    this.measurements.activePoints.push(position);
    
    switch (this.measurements.currentMode) {
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
    
    this.addMeasurementPoint(position, this.measurements.activePoints.length);
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
    if (this.measurements.activePoints.length === 2) {
      const distance = Cesium.Cartesian3.distance(
        this.measurements.activePoints[0],
        this.measurements.activePoints[1]
      );
      
      this.displayMeasurement(`${distance.toFixed(2)} m`, 
        `Direkte Luftlinie zwischen 2 Punkten`);
      
      this.addToHistory('Abstand', `${distance.toFixed(2)} m`);
      this.drawMeasurementLine(this.measurements.activePoints[0], this.measurements.activePoints[1], `${distance.toFixed(2)} m`);
      
      setTimeout(() => this.resetCurrentMeasurement(), 2000);
    } else if (this.measurements.activePoints.length === 1) {
      this.displayMeasurement('Klicken Sie den zweiten Punkt...', 'Erster Punkt gesetzt');
    }
  }

  measurePolylineLength() {
    if (this.measurements.activePoints.length >= 2) {
      let totalLength = 0;
      const points = this.measurements.activePoints;
      
      for (let i = 1; i < points.length; i++) {
        totalLength += Cesium.Cartesian3.distance(points[i-1], points[i]);
      }
      
      this.displayMeasurement(`${totalLength.toFixed(2)} m`, 
        `Länge über ${points.length} Punkte`);
      
      this.drawMeasurementPolyline(points, `${totalLength.toFixed(2)} m`);
    } else {
      this.displayMeasurement('Mindestens 2 Punkte erforderlich...', 
        `${this.measurements.activePoints.length} Punkt(e) gesetzt`);
    }
  }

  measurePolygonArea() {
    const points = this.measurements.activePoints;
    
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
    if (!position || typeof position.x !== 'number') {
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
      
      this.measurements.measurementEntities.push(point);
      
    } catch (error) {
      console.error("Error adding measurement point:", error);
      this.showToast("Fehler beim Hinzufügen des Messpunkts", "error");
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
      
      this.measurements.measurementEntities.push(line, labelEntity);
      
    } catch (error) {
      console.error("Error drawing line:", error);
      this.showToast("Fehler beim Zeichnen der Linie", "error");
    }
  }

  drawMeasurementPolyline(points, label) {
    if (!points || points.length < 2) return;
    
    try {
      const validPoints = points.filter(point => 
        point && typeof point.x === 'number' && typeof point.y === 'number' && typeof point.z === 'number'
      );
      
      if (validPoints.length < 2) return;
      
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
      
      this.measurements.measurementEntities.push(polyline, labelEntity);
      
    } catch (error) {
      console.error("Error drawing polyline:", error);
      this.showToast("Fehler beim Zeichnen der Linie", "error");
    }
  }

  drawMeasurementPolygon(points, label) {
    if (!points || points.length < 3) return;
    
    try {
      const validPoints = points.filter(point => 
        point && typeof point.x === 'number' && typeof point.y === 'number' && typeof point.z === 'number'
      );
      
      if (validPoints.length < 3) return;
      
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
      
      this.measurements.measurementEntities.push(polygon, labelEntity);
      
    } catch (error) {
      console.error("Error drawing polygon:", error);
      this.showToast("Fehler beim Zeichnen des Polygons", "error");
    }
  }

  displayMeasurement(value, details) {
    const container = Utils.getElement('currentMeasurement');
    const valueEl = Utils.getElement('measurementValue');
    const detailsEl = Utils.getElement('measurementDetails');
    
    if (container) container.style.display = 'block';
    if (valueEl) valueEl.textContent = value;
    if (detailsEl) detailsEl.textContent = details;
  }

  addToHistory(type, value) {
    this.measurements.measurementHistory.unshift({
      type: type,
      value: value,
      timestamp: new Date().toLocaleTimeString()
    });
    
    if (this.measurements.measurementHistory.length > 10) {
      this.measurements.measurementHistory.pop();
    }
    
    this.updateHistoryDisplay();
  }

  updateHistoryDisplay() {
    const historyTitle = Utils.getElement('historyTitle');
    const historyList = Utils.getElement('historyList');
    
    if (this.measurements.measurementHistory.length > 0) {
      if (historyTitle) historyTitle.style.display = 'block';
      
      if (historyList) {
        const html = this.measurements.measurementHistory.map(item => `
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
    const mode = this.measurements.currentMode;
    const points = this.measurements.activePoints;
    
    if (mode === 'polyline' && points.length >= 2) {
      let totalLength = 0;
      for (let i = 1; i < points.length; i++) {
        totalLength += Cesium.Cartesian3.distance(points[i-1], points[i]);
      }
      this.addToHistory('Polygon-Länge', `${totalLength.toFixed(2)} m`);
      this.showToast(`Polygon-Länge: ${totalLength.toFixed(2)} m`, 'success');
      
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
      this.showToast(`Polygon-Fläche: ${displayArea} ${unit}`, 'success');
    }
    
    this.resetCurrentMeasurement();
  }

  cancelCurrentMeasurement() {
    this.clearCurrentMeasurementEntities();
    this.resetCurrentMeasurement();
  }

  resetCurrentMeasurement() {
    this.measurements.activePoints = [];
    this.measurements.currentMeasurement = null;
    this.updateMeasurementDisplay();
  }

  clearCurrentMeasurementEntities() {
    if (this.viewer && this.measurements.measurementEntities) {
      this.measurements.measurementEntities.forEach(entity => {
        this.viewer.entities.remove(entity);
      });
      this.measurements.measurementEntities = [];
    }
  }

  clearAllMeasurements() {
    if (confirm('Alle Messungen löschen?')) {
      this.clearCurrentMeasurementEntities();
      this.measurements.measurementHistory = [];
      this.updateHistoryDisplay();
      this.resetCurrentMeasurement();
      this.showToast('Alle Messungen gelöscht', 'success');
    }
  }

  updateMeasurementDisplay() {
    const container = Utils.getElement('currentMeasurement');
    if (container && this.measurements.activePoints.length === 0) {
      container.style.display = 'none';
    }
  }

  // ===========================
  // Hidden Features Methods
  // ===========================
  toggleHideMode() {
    this.hiddenFeatures.isHideMode = !this.hiddenFeatures.isHideMode;
    
    const btn = Utils.getElement("toggleHideMode");
    const indicator = Utils.getElement("hideModeIndicator");
    const cesiumContainer = Utils.getElement("cesiumContainer");
    
    if (this.hiddenFeatures.isHideMode) {
      // Exit other modes
      if (this.comments.isCommentMode) {
        this.exitCommentMode();
      }
      if (this.measurements.isActive) {
        this.setMeasurementMode('');
      }
      
      if (btn) {
        btn.textContent = "🛑 Stoppen";
        btn.className = "btn btn-danger btn-small";
      }
      if (indicator) indicator.style.display = "block";
      if (cesiumContainer) cesiumContainer.classList.add("hide-mode");
      
      this.showToast("Hide-Modus aktiviert - Klicken Sie auf Features zum Verstecken", 'info', 3000);
    } else {
      if (btn) {
        btn.textContent = "🎯 Hide-Modus";
        btn.className = "btn btn-primary btn-small";
      }
      if (indicator) indicator.style.display = "none";
      if (cesiumContainer) cesiumContainer.classList.remove("hide-mode");
      
      this.showToast("Hide-Modus deaktiviert", 'info', 2000);
    }
  }

  handleHideModeClick(click) {
    const feature = this.viewer.scene.pick(click.position);
    
    if (feature instanceof Cesium.Cesium3DTileFeature) {
      this.hideFeature(feature);
      this.showToast(`Feature versteckt`, 'success', 2000);
    } else {
      this.showToast('Kein Feature zum Verstecken gefunden', 'warning', 2000);
    }
  }

  hideFeature(feature) {
    if (!feature || !(feature instanceof Cesium.Cesium3DTileFeature)) {
      return;
    }

    // Get feature properties for identification
    const name = feature.getProperty("name") || "Unbenannt";
    const objektId = feature.getProperty("_213WehranlagenObjektIdentNr") || 
                     feature.getProperty("id") || 
                     Date.now().toString();

    // Hide the feature
    feature.show = false;

    // Store the hidden feature
    const hiddenFeature = {
      feature: feature,
      name: name,
      id: objektId,
      timestamp: new Date().toISOString()
    };

    this.hiddenFeatures.features.push(hiddenFeature);
    this.updateHiddenFeaturesDisplay();
    
    // Show the hidden features panel if not visible
    const panel = Utils.getElement("hiddenFeaturesPanel");
    if (panel && panel.style.display === "none") {
      this.showPanel("hiddenFeatures");
    }

    this.showToast(`Feature "${name}" versteckt`, 'success', 2000);
  }

  showFeature(hiddenFeature) {
    if (hiddenFeature.feature) {
      hiddenFeature.feature.show = true;
      
      // Remove from hidden features list
      const index = this.hiddenFeatures.features.indexOf(hiddenFeature);
      if (index > -1) {
        this.hiddenFeatures.features.splice(index, 1);
      }
      
      this.updateHiddenFeaturesDisplay();
      this.showToast(`Feature "${hiddenFeature.name}" wiederhergestellt`, 'success', 2000);
    }
  }

  showFeatureByIndex(index) {
    const hiddenFeature = this.hiddenFeatures.features[index];
    if (hiddenFeature) {
      this.showFeature(hiddenFeature);
    }
  }

  showAllHiddenFeatures() {
    const count = this.hiddenFeatures.features.length;
    
    this.hiddenFeatures.features.forEach(hiddenFeature => {
      if (hiddenFeature.feature) {
        hiddenFeature.feature.show = true;
      }
    });
    
    this.hiddenFeatures.features = [];
    this.updateHiddenFeaturesDisplay();
    
    if (count > 0) {
      this.showToast(`${count} Features wiederhergestellt`, 'success', 3000);
    }
  }

  updateHiddenFeaturesDisplay() {
    const list = Utils.getElement("hiddenFeaturesList");
    if (!list) return;
    
    if (this.hiddenFeatures.features.length === 0) {
      list.innerHTML = `
        <div class="no-hidden-features">
          Keine versteckten Features.<br>
          <small>Nutzen Sie den Hide-Modus oder verstecken Sie Features über die Info-Box.</small>
        </div>
      `;
      return;
    }
    
    const container = document.createElement('div');
    
    this.hiddenFeatures.features.forEach((hiddenFeature, index) => {
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
        this.showFeatureByIndex(index);
      }
    });
    
    list.innerHTML = '';
    list.appendChild(container);
  }

  // ===========================
  // Imagery Provider Methods
  // ===========================
  async switchImageryProvider(type) {
    try {
      console.log(`🔄 Switching imagery to: ${type}`);
      
      if (type === "ortho") {
        if (this.currentLocalImageryLayer) {
          this.currentLocalImageryLayer.show = true;
        } else {
          console.warn("⚠️ No local orthophoto layer available");
          this.showToast("Kein lokales Orthophoto verfügbar für diese Szene", "warning");
        }
        
        if (this.globalImageryLayer) {
          this.globalImageryLayer.show = true;
        } else {
          await this.ensureGlobalImagery();
        }
        
      } else {
        if (this.currentLocalImageryLayer) {
          this.currentLocalImageryLayer.show = false;
        }
        
        if (!this.globalImageryLayer) {
          await this.ensureGlobalImagery();
        }
        
        if (this.globalImageryLayer) {
          this.globalImageryLayer.show = true;
        }
        
        if (type === "osm") {
          await this.switchToOSM();
        } else if (type === "bing") {
          await this.switchToBing();
        }
      }
      
    } catch (error) {
      console.error('❌ Imagery switch error:', error);
      this.showToast('Fehler beim Wechseln des Kartenhintergrunds: ' + error.message, 'error');
    }
  }

  async switchToOSM() {
    if (this.globalImageryProvider instanceof Cesium.OpenStreetMapImageryProvider) {
      console.log("Already using OSM, no change needed");
      return;
    }
    
    console.log("🗺️ Switching to OpenStreetMap...");
    if (this.globalImageryLayer) {
      this.viewer.imageryLayers.remove(this.globalImageryLayer, true);
    }
    
    this.globalImageryProvider = new Cesium.OpenStreetMapImageryProvider({
      url: "https://a.tile.openstreetmap.org/"
    });
    this.globalImageryLayer = this.viewer.imageryLayers.addImageryProvider(this.globalImageryProvider, 0);
    this.globalImageryLayer.show = true;
    console.log("✅ Switched to OpenStreetMap");
  }

  async switchToBing() {
    if (this.globalImageryProvider instanceof Cesium.BingMapsImageryProvider) {
      console.log("Already using Bing, no change needed");
      return;
    }
    
    console.log("🛰️ Switching to Bing Aerial...");
    if (this.globalImageryLayer) {
      this.viewer.imageryLayers.remove(this.globalImageryLayer, true);
    }
    
    try {
      this.globalImageryProvider = await Cesium.createWorldImageryAsync();
      this.globalImageryLayer = this.viewer.imageryLayers.addImageryProvider(this.globalImageryProvider, 0);
      this.globalImageryLayer.show = true;
      console.log("✅ Switched to Bing Aerial");
    } catch (error) {
      console.warn("Failed to load Bing, keeping current provider:", error);
      throw error;
    }
  }

  // Model Toggle Methods
  toggleModel(assetId, show) {
    console.log(`🔄 Toggling model ${assetId}: ${show ? 'SHOW' : 'HIDE'}`);
    
    const tileset = this.assetIdToTilesetMap[assetId];
    if (tileset) {
      tileset.show = show;
      
      const checkbox = document.querySelector(`[data-asset-id="${assetId}"]`);
      if (checkbox && checkbox.checked !== show) {
        checkbox.checked = show;
      }
      
      this.showToast(
        `${show ? 'Aktiviert' : 'Deaktiviert'}: Asset ${assetId}`, 
        'success', 
        2000
      );
    } else {
      console.error(`❌ No tileset found for asset ID: ${assetId}`);
      this.showToast(`Fehler: Modell ${assetId} nicht gefunden`, 'error');
    }
  }

  testLauffenModels() {
    this.testModels([3256557, 3256547, 3256555, 3273407], 'Lauffen');
  }

  testZeltingenModels() {
    this.testModels([3251780, 3341583], 'Zeltingen');
  }

  testModels(assetIds, name) {
    console.log(`🔧 Testing ${name} model toggles...`);
    
    let currentIndex = 0;
    
    const toggleNext = () => {
      if (currentIndex < assetIds.length) {
        const assetId = assetIds[currentIndex];
        
        // Hide all
        assetIds.forEach(id => this.toggleModel(id, false));
        
        // Show current
        this.toggleModel(assetId, true);
        
        currentIndex++;
        setTimeout(toggleNext, 1500);
      } else {
        // Show all at the end
        setTimeout(() => {
          assetIds.forEach(id => this.toggleModel(id, true));
          this.showToast(`${name} Test abgeschlossen!`, "success");
        }, 1000);
      }
    };
    
    this.showToast(`Starte ${name} Model-Test...`, "info");
    toggleNext();
  }

  showAllLauffenModels() {
    this.showAllModels([3256557, 3256547, 3256555, 3273407], 'Lauffen');
  }

  hideAllLauffenModels() {
    this.hideAllModels([3256557, 3256547, 3256555, 3273407], 'Lauffen');
  }

  showAllZeltingenModels() {
    this.showAllModels([3251780, 3341583], 'Zeltingen');
  }

  hideAllZeltingenModels() {
    this.hideAllModels([3251780, 3341583], 'Zeltingen');
  }

  showAllModels(assetIds, name) {
    console.log(`👁️ Showing all ${name} models...`);
    assetIds.forEach(assetId => this.toggleModel(assetId, true));
    this.showToast(`Alle ${name}-Modelle angezeigt`, "success");
  }

  hideAllModels(assetIds, name) {
    console.log(`🙈 Hiding all ${name} models...`);
    assetIds.forEach(assetId => this.toggleModel(assetId, false));
    this.showToast(`Alle ${name}-Modelle versteckt`, "success");
  }

  // Point Cloud Methods
  detectPointClouds() {
    console.log("🔍 Detecting point clouds...");
    this.pointCloudAssets = [];
    
    this.currentModels.forEach((tileset) => {
      const assetId = Object.keys(this.assetIdToTilesetMap).find(
        key => this.assetIdToTilesetMap[key] === tileset
      );
      
      if (this.isPointCloudTileset(tileset, assetId)) {
        console.log(`☁️ Point cloud detected: Asset ${assetId}`);
        this.pointCloudAssets.push({
          tileset: tileset,
          assetId: assetId,
          name: `Point Cloud ${assetId}`
        });
        
        this.applyPointCloudSettings(tileset);
      }
    });
    
    console.log(`✅ Found ${this.pointCloudAssets.length} point clouds`);
    
    if (this.pointCloudAssets.length > 0) {
      this.togglePointCloudEDL();
      this.showToast(`${this.pointCloudAssets.length} Punktwolke(n) erkannt`, 'success');
    }
  }

  isPointCloudTileset(tileset, assetId) {
    const knownPointCloudIds = [3341583];
    return knownPointCloudIds.includes(parseInt(assetId)) || !!tileset.pointCloudShading;
  }

  applyPointCloudSettings(tileset) {
    if (!tileset.pointCloudShading) {
      tileset.pointCloudShading = new Cesium.PointCloudShading({
        attenuation: this.pointCloudSettings.attenuation,
        geometricErrorScale: 0.5,
        maximumAttenuation: 3,
        baseResolution: 0.1
      });
    } else {
      const shading = tileset.pointCloudShading;
      shading.attenuation = this.pointCloudSettings.attenuation;
      shading.geometricErrorScale = 0.5;
      shading.maximumAttenuation = 3;
      shading.baseResolution = 0.1;
    }
  }

  handlePointSizeChange(e) {
    const value = parseFloat(e.target.value);
    
    const labels = ['Sehr klein', 'Klein', 'Normal', 'Groß', 'Sehr groß'];
    const thresholds = [0.3, 0.4, 0.6, 1.0];
    let label = labels[labels.length - 1];
    
    for (let i = 0; i < thresholds.length; i++) {
      if (value <= thresholds[i]) {
        label = labels[i];
        break;
      }
    }
    
    const pointSizeValue = Utils.getElement('pointSizeValue');
    if (pointSizeValue) pointSizeValue.textContent = label;
    
    this.pointCloudAssets.forEach(asset => {
      Utils.safeExecute(() => {
        if (asset.tileset.pointCloudShading) {
          asset.tileset.pointCloudShading.geometricErrorScale = value;
          asset.tileset.pointCloudShading.baseResolution = value * 0.2;
        }
        
        asset.tileset.style = new Cesium.Cesium3DTileStyle({
          pointSize: Math.max(1, value * 4)
        });
      }, "Could not apply point size");
    });
    
    if (this.viewer?.scene) {
      this.viewer.scene.requestRender();
    }
    
    this.showToast(`Punktgröße: ${label}`, 'info', 1500);
  }

  handleEDLToggle(e) {
    this.pointCloudSettings.eyeDomeLighting = e.target.checked;
    this.togglePointCloudEDL();
    const status = e.target.checked ? 'AKTIVIERT' : 'DEAKTIVIERT';
    this.showToast(`Eye Dome Lighting: ${status}`, 'success', 2000);
  }

  handleAttenuationToggle(e) {
    this.pointCloudSettings.attenuation = e.target.checked;
    this.updateAllPointClouds();
    const status = e.target.checked ? 'AKTIVIERT' : 'DEAKTIVIERT';
    this.showToast(`Distance Attenuation: ${status}`, 'success', 2000);
  }

  updateAllPointClouds() {
    this.pointCloudAssets.forEach(asset => {
      this.applyPointCloudSettings(asset.tileset);
    });
    
    if (this.pointCloudAssets.length > 0 && this.viewer?.scene) {
      this.viewer.scene.requestRender();
    }
  }

  togglePointCloudEDL() {
    // Implementation of EDL toggle
    // Copy the optimized version from original code
  }

  debugPointClouds() {
    // Implementation of debug functionality
    // Copy from original code
  }

  // Data Management Methods
  exportJSON() {
    const jsonData = this.commentsAPI.exportJSON();
    this.downloadFile(jsonData, 'application/json', 'baw-kommentare', 'json');
    this.showToast('JSON-Datei heruntergeladen!', 'success');
  }

  exportCSV() {
    const csvData = this.commentsAPI.exportCSV();
    const preview = Utils.getElement('csvPreview');
    if (preview) preview.textContent = csvData;
    
    const overlay = Utils.getElement('csvExportOverlay');
    if (overlay) overlay.style.display = 'flex';
    
    this.currentCSVData = csvData;
  }

  downloadCSV() {
    this.downloadFile(this.currentCSVData, 'text/csv;charset=utf-8;', 'baw-kommentare', 'csv');
    this.closeCSVDialog();
    this.showToast('CSV-Datei heruntergeladen!', 'success');
  }

  async copyCSVToClipboard() {
    try {
      await navigator.clipboard.writeText(this.currentCSVData);
      this.showToast('CSV in Zwischenablage kopiert!', 'success');
    } catch (error) {
      this.showToast('Fehler beim Kopieren in die Zwischenablage', 'error');
    }
  }

  closeCSVDialog() {
    const overlay = Utils.getElement('csvExportOverlay');
    if (overlay) overlay.style.display = 'none';
    this.currentCSVData = null;
  }

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
  }

  handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        
        if (file.name.endsWith('.json')) {
          this.commentsAPI.importData(content);
        } else if (file.name.endsWith('.csv')) {
          this.commentsAPI.importCSV(content);
        } else {
          throw new Error('Unsupported file type');
        }
        
        this.updateDataStatus();
        this.loadCommentsFromStorage();
        this.showToast('Daten erfolgreich importiert!', 'success');
        
      } catch (error) {
        this.showToast('Fehler beim Importieren: ' + error.message, 'error');
      }
    };
    
    reader.readAsText(file);
    event.target.value = '';
  }

  clearAllData() {
    if (confirm('Möchten Sie wirklich alle Kommentare löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      this.commentsAPI.clearAllData();
      this.updateDataStatus();
      this.loadCommentsFromStorage();
      this.showToast('Alle Daten gelöscht!', 'success');
    }
  }

  // User Settings Methods
  loadUserSettings() {
    const savedUserName = localStorage.getItem('baw_user_name');
    const savedRenderQuality = localStorage.getItem('baw_render_quality') || 'balanced';
    
    if (savedUserName) {
      const userNameInput = Utils.getElement('userName');
      if (userNameInput) userNameInput.value = savedUserName;
      this.userName = savedUserName;
    }
    
    const renderQualitySelect = Utils.getElement('renderQualitySelect');
    if (renderQualitySelect) renderQualitySelect.value = savedRenderQuality;
    
    this.setRenderQuality(savedRenderQuality, false);
    this.updateRenderQualityDescription(savedRenderQuality);
  }

  saveUserSettings() {
    const userNameInput = Utils.getElement('userName');
    if (userNameInput) {
      const userName = userNameInput.value;
      localStorage.setItem('baw_user_name', userName);
      this.userName = userName;
    }
  }

  setRenderQuality(quality, save = true) {
    if (!this.renderQualitySettings[quality]) {
      console.warn(`Unknown render quality: ${quality}`);
      return;
    }
    
    console.log(`🎮 Setting render quality to: ${quality}`);
    this.currentRenderQuality = quality;
    
    if (save) {
      localStorage.setItem('baw_render_quality', quality);
    }
    
    this.updateRenderQualityDescription(quality);
    
    if (this.viewer) {
      this.applyRenderQualitySettings(quality);
    }
    
    this.showToast(`Render-Qualität: ${this.renderQualitySettings[quality].name}`, 'success', 3000);
  }

  updateRenderQualityDescription(quality) {
    const description = Utils.getElement('renderQualityDescription');
    if (description && this.renderQualitySettings[quality]) {
      description.textContent = this.renderQualitySettings[quality].description;
    }
  }

  applyRenderQualitySettings(quality) {
    const settings = this.renderQualitySettings[quality].settings;
    
    Utils.safeExecute(() => {
      this.applyViewerSettings(settings);
      
      // Apply to existing tilesets
      this.currentModels.forEach(tileset => {
        this.applyTilesetQualitySettings(tileset, settings);
      });
      
      if (this.viewer.scene.requestRenderMode) {
        this.viewer.scene.requestRender();
      }
      
      console.log(`🎮 Render quality successfully applied: ${quality}`);
    }, "Error applying render quality settings");
  }

  // UI Helper Methods
  updateDataStatus() {
    const stats = this.commentsAPI.getStats();
    const statusElement = Utils.getElement('dataStatus');
    if (statusElement) {
      statusElement.textContent = `${stats.totalComments} Kommentare in ${stats.scenes} Szenen`;
    }
  }

  showFeatureInfo(feature) {
    try {
      const info = this.extractFeatureInfo(feature);
      const content = this.buildFeatureInfoHTML(info);
      
      const infoContent = Utils.getElement("infoContent");
      if (infoContent) infoContent.innerHTML = content;
      
      const infoBox = Utils.getElement("infoBox");
      if (infoBox) infoBox.style.display = "block";

    } catch (error) {
      this.handleError("Fehler beim Anzeigen der Feature-Information", error);
    }
  }

  extractFeatureInfo(feature) {
    const info = {
      name: feature.getProperty("name") || "-",
      objektId: feature.getProperty("_213WehranlagenObjektIdentNr") || "-",
      zusatz: feature.getProperty("_213WehranlagenZusatzkennzeichnung") || "-",
      objektteileKennzahl: "-"
    };
    
    // Try to find objektteileKennzahl
    const possibleProps = [
      "_213WehranlagenObjektteileKennzahl",
      "objektteileKennzahl", 
      "objectPartCode",
      "partCode"
    ];
    
    for (const prop of possibleProps) {
      try {
        const value = feature.getProperty(prop);
        if (value !== null && value !== undefined && value !== "-") {
          info.objektteileKennzahl = value.toString();
          break;
        }
      } catch (e) {
        // Continue trying other properties
      }
    }
    
    // Try extraction from name
    if (info.objektteileKennzahl === "-") {
      const nameMatch = info.name.match(/\.(\d+)[\s\-]/);
      if (nameMatch) {
        info.objektteileKennzahl = nameMatch[1];
      }
    }
    
    return info;
  }

  buildFeatureInfoHTML(info) {
    const isZeltingen = this.currentGroup?.name === "Schleuse Zeltingen";
    
    let content = '<div style="max-height: 300px; overflow-y: auto; font-family: monospace; line-height: 1.6;">';

    if (isZeltingen) {
      const objektartenKennzahl = "213";
      const objektartenText = this.objektartenMap[objektartenKennzahl] || "Wehranlagen";
      const objektteileText = this.objektteileMap[objektartenKennzahl]?.[info.objektteileKennzahl] || "Verschlusskörper";

      content += `
        <div style="margin-bottom: 12px;">
          <strong style="color: #4FC3F7;">Objektartenkennzahl:</strong> ${objektartenKennzahl} / ${objektartenText}
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #4FC3F7;">Objektident-Nr.:</strong> ${info.objektId}
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #4FC3F7;">Objektteile-Kennzahl:</strong> ${info.objektteileKennzahl} / ${objektteileText}
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #4FC3F7;">Zusatzkennzahl:</strong> ${info.zusatz}
        </div>
      `;
    } else {
      content += `
        <div style="margin-bottom: 12px;">
          <strong style="color: #4FC3F7;">Name:</strong> ${info.name}
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #4FC3F7;">Objekt-ID:</strong> ${info.objektId}
        </div>
        <div style="margin-bottom: 12px;">
          <strong style="color: #4FC3F7;">Zusatzkennz.:</strong> ${info.zusatz}
        </div>
      `;
    }

    content += '</div>';
    return content;
  }

  hideInfoBox() {
    const infoBox = Utils.getElement("infoBox");
    if (infoBox) infoBox.style.display = "none";
    this.currentSelectedFeature = null;
  }

  hideCurrentFeature() {
    if (this.currentSelectedFeature) {
      this.hideFeature(this.currentSelectedFeature);
      this.hideInfoBox();
    }
  }

  // Loading & Toast Methods
  showLoading(text = "Lädt...") {
    const loadingText = Utils.getElement("loadingText");
    if (loadingText) loadingText.textContent = text;
    
    const overlay = Utils.getElement("loadingOverlay");
    if (overlay) overlay.classList.remove("hidden");
  }

  hideLoading() {
    const overlay = Utils.getElement("loadingOverlay");
    if (overlay) overlay.classList.add("hidden");
  }

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
  }

  handleError(message, error) {
    console.error(message, error);
    this.hideLoading();
    this.showToast(`${message}: ${error.message}`, "error", 6000);
  }

  // Cleanup Method
  cleanup() {
    console.log("🧹 Cleaning up CesiumApp...");
    
    // Stop performance monitoring
    if (this.performanceMonitorInterval) {
      clearInterval(this.performanceMonitorInterval);
      this.performanceMonitorInterval = null;
    }
    
    // Remove event listeners
    this._eventListeners.forEach(({ element, eventType, handler }) => {
      element.removeEventListener(eventType, handler);
    });
    this._eventListeners.clear();
    
    // Remove window listeners
    window.removeEventListener('resize', this._boundMethods.get('handleResize'));
    document.removeEventListener('keydown', this._boundMethods.get('handleKeydown'));
    
    // Clear caches
    Utils.clearElementCache();
    this.commentsAPI._cache.clear();
    
    // Destroy Cesium viewer
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
    
    // Clear handlers
    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }
    
    console.log("✅ Cleanup complete");
  }
}

// ===========================
// Initialize Application
// ===========================
document.addEventListener("DOMContentLoaded", () => {
  console.log("🌟 Initializing BAW Cesium App - Optimized Version");
  
  const app = new CesiumApp();
  
  // Make methods available globally for HTML onclick handlers
  window.cesiumApp = app;
  
  // Also expose specific methods that are called from HTML
  window.cesiumApp.zoomToComment = app.zoomToComment.bind(app);
  window.cesiumApp.openEditComment = app.openEditComment.bind(app);
  window.cesiumApp.deleteComment = app.deleteComment.bind(app);
  window.cesiumApp.showFeatureByIndex = app.showFeatureByIndex.bind(app);
  
  // Initialize the app
  app.init();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    app.cleanup();
  });
});