/**
 * BAW Cesium Viewer - Core Application
 * Version: 2.0.2 - EDL Removed
 * Cesium Version: 1.132
 */

// ===========================
// Main CesiumApp Class
// ===========================
class CesiumApp {
  constructor() {
    this.initializeState();
    this.setupOptimizations();
  }

  initializeState() {
    // Core objects
    this.viewer = null;
    this.handler = null;
    
    // Scene Management
    this.currentModels = [];
    this.currentGroup = null;
    this.assetIdToTilesetMap = {};
    this.currentLocalImageryLayer = null;
    this.globalImageryProvider = null;
    this.globalTerrainProvider = null;
    this.globalImageryLayer = null;
    
    // Managers
    this.comments = new CommentsManager();
    this.measurements = null; // Will be initialized after viewer
    this.hiddenFeatures = new BAWUtils.HiddenFeaturesSystem();
    
    // Point Cloud
    this.pointCloudAssets = [];
    this.pointCloudSettings = { ...BAWUtils.config.pointCloudDefaults };
    
    // Settings
    this.currentRenderQuality = 'balanced';
    this.userName = '';
    
    // Performance
    this._eventListeners = new Map();
    this._boundMethods = new Map();
  }

  setupOptimizations() {
    // Create bound methods once to avoid creating new functions
    this._boundMethods.set('handleResize', BAWUtils.utils.debounce(this.handleResize.bind(this), 250));
    this._boundMethods.set('handleKeydown', this.handleKeydown.bind(this));
    
    // Setup RAF for smooth animations - must bind to window context
    this.raf = (window.requestAnimationFrame || 
               window.webkitRequestAnimationFrame || 
               window.mozRequestAnimationFrame || 
               ((callback) => window.setTimeout(callback, 1000 / 60))).bind(window);
  }

  // ===========================
  // Initialization
  // ===========================
  async init() {
    try {
      console.log("🚀 Starting Cesium initialization...");
      BAWUtils.ui.showLoading("Cesium wird initialisiert...");
      
      await this.setupCesium();
      this.comments.init(this.viewer);
      this.measurements = new BAWUtils.MeasurementSystem(this.viewer);
      this.setupUI();
      this.setupEventHandlers();
      this.loadUserSettings();
      this.comments.updateDataStatus();
      
      BAWUtils.ui.hideLoading();
      console.log("🎉 Initialization complete!");
      BAWUtils.ui.showToast("BAW Cesium Viewer mit lokalen Kommentaren geladen!", "success");
      
    } catch (error) {
      this.handleInitError(error);
    }
  }

  handleInitError(error) {
    console.error("❌ Initialization failed:", error);
    BAWUtils.ui.hideLoading();
    
    const errorMsg = error.message || "Unbekannter Fehler";
    BAWUtils.ui.showToast(`Initialisierung fehlgeschlagen: ${errorMsg}`, "error", 10000);
    
    // Try partial initialization
    BAWUtils.utils.safeExecute(() => {
      this.setupUI();
      this.setupEventHandlers();
      this.loadUserSettings();
      this.comments.updateDataStatus();
      BAWUtils.ui.showToast("Teilweise Initialisierung erfolgreich - 3D-Funktionen möglicherweise eingeschränkt", "warning", 8000);
    }, "Even fallback initialization failed");
  }

  async setupCesium() {
    console.log("🌍 Setting up Cesium...");
    
    Cesium.Ion.defaultAccessToken = BAWUtils.config.cesium.accessToken;
    
    // Optimize request scheduling
    Cesium.RequestScheduler.requestsByServer = {
      'api.cesium.com:443': 18,
      'assets.cesium.com:443': 18,
      'cdn.jsdelivr.net:443': 12
    };
    
    const qualitySettings = BAWUtils.config.renderQualitySettings[this.currentRenderQuality].settings;
    
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

  setupUI() {
    console.log("🎨 Setting up UI...");
    
    const sceneSelect = BAWUtils.utils.getElement("sceneSelect");
    if (sceneSelect) {
      // Use DocumentFragment for better performance
      const fragment = document.createDocumentFragment();
      
      BAWUtils.config.modelGroups.forEach((group, index) => {
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
  // Event Handlers
  // ===========================
  setupEventHandlers() {
    console.log("🎮 Setting up event handlers...");
    
    // Create event handler map for better organization
    const handlers = {
      // Data management
      'exportJSON': () => this.comments.exportJSON(),
      'exportCSV': () => this.comments.exportCSV(),
      'importData': () => BAWUtils.utils.getElement('fileInput').click(),
      'clearData': () => this.comments.clearAllData(),
      'fileInput': (e) => this.comments.handleFileImport(e),
      
      // CSV Export Dialog
      'downloadCSV': () => this.comments.downloadCSV(),
      'copyCSV': () => this.comments.copyCSVToClipboard(),
      'cancelCSV': () => this.comments.closeCSVDialog(),
      
      // Scene selection
      'sceneSelect': (e) => this.handleSceneChange(e),
      
      // Render quality
      'renderQualitySelect': (e) => this.setRenderQuality(e.target.value),
      
      // Imagery selection
      'imagerySelect': (e) => this.switchImageryProvider(e.target.value),
      
      // Comments panel
      'closeCommentsBtn': () => this.hidePanel("comments"),
      'refreshComments': () => this.comments.loadCommentsFromStorage(),
      'toggleCommentMode': () => this.comments.toggleCommentMode(),
      'addCommentBtn': () => this.comments.addComment(),
      'cancelCommentBtn': () => this.comments.exitCommentMode(),
      
      // Comment edit
      'saveCommentBtn': () => this.comments.saveEditComment(),
      'cancelEditBtn': () => this.comments.closeEditComment(),
      
      // Panel toggles
      'toggleCommentsPanel': (e) => this.togglePanel('comments', e.target.checked),
      'toggleMeasurePanel': (e) => this.togglePanel('measure', e.target.checked),
      'toggleHiddenFeaturesPanel': (e) => this.togglePanel('hiddenFeatures', e.target.checked),
      
      // Info box
      'closeInfoBtn': () => this.hideInfoBox(),
      'hideFeatureBtn': () => this.hideCurrentFeature(),
      
      // Hidden features panel
      'closeHiddenFeaturesBtn': () => this.hidePanel("hiddenFeatures"),
      'toggleHideMode': () => this.hiddenFeatures.toggleHideMode(),
      'showAllHidden': () => this.hiddenFeatures.showAll(),
      
      // Measurement panel
      'closeMeasureBtn': () => this.hidePanel("measure"),
      'measureModeSelect': (e) => this.measurements.setMode(e.target.value),
      'finishMeasurement': () => this.measurements.finishCurrentMeasurement(),
      'cancelMeasurement': () => this.measurements.cancelCurrentMeasurement(),
      'clearMeasurements': () => this.measurements.clearAll(),
      
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
      'toggleAttenuation': (e) => this.handleAttenuationToggle(e),
      'debugPointCloud': () => this.debugPointClouds()
    };

    // Attach all handlers
    Object.entries(handlers).forEach(([id, handler]) => {
      const element = BAWUtils.utils.getElement(id);
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
      const element = BAWUtils.utils.getElement(id);
      if (element) {
        const assetId = parseInt(element.dataset.assetId);
        element.addEventListener('change', (e) => this.toggleModel(assetId, e.target.checked));
      }
    });

    // Zeltingen models
    ['model3251780', 'model3341583'].forEach(id => {
      const element = BAWUtils.utils.getElement(id);
      if (element) {
        const assetId = parseInt(element.dataset.assetId);
        element.addEventListener('change', (e) => this.toggleModel(assetId, e.target.checked));
      }
    });
  }

  setupDialogHandlers() {
    const overlays = ['commentEditOverlay', 'csvExportOverlay'];
    overlays.forEach(id => {
      const element = BAWUtils.utils.getElement(id);
      if (element) {
        element.addEventListener('click', (e) => {
          if (e.target.id === id) {
            if (id === 'commentEditOverlay') this.comments.closeEditComment();
            else if (id === 'csvExportOverlay') this.comments.closeCSVDialog();
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
      this.comments.exitCommentMode();
    } else {
      this.hideAllPanels();
      this.comments.closeCSVDialog();
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
      const panel = BAWUtils.utils.getElement(`${panelType}Panel`);
      if (panel) {
        const isVisible = panel.style.display !== "none";
        isVisible ? this.hidePanel(panelType) : this.showPanel(panelType);
      }
    }
  }

  // ===========================
  // Scene Management
  // ===========================
  handleSceneChange(e) {
    const index = parseInt(e.target.value);
    if (!isNaN(index)) {
      this.loadScene(BAWUtils.config.modelGroups[index]);
    } else {
      this.clearScene();
    }
  }

  async loadScene(group) {
    try {
      console.log(`📦 Loading scene: ${group.name}`);
      BAWUtils.ui.showLoading(`Lade ${group.name}...`);

      await this.clearScene();
      this.currentGroup = group;
      this.comments.setCurrentGroup(group);

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
      this.comments.loadCommentsFromStorage();
      this.comments.updateCommentModeUI();

      BAWUtils.ui.hideLoading();
      BAWUtils.ui.showToast(`${group.name} geladen!`, "success");

    } catch (error) {
      BAWUtils.ui.handleError(`Fehler beim Laden von ${group.name}`, error);
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
    const imagerySelect = BAWUtils.utils.getElement("imagerySelect");
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
      const settings = BAWUtils.config.renderQualitySettings[this.currentRenderQuality].settings;
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
    BAWUtils.ui.toggleVisibility("citygmlToggleContainer", true);
    BAWUtils.ui.toggleVisibility("lauffenModelToggles", true);
  }

  setupZeltingenFeatures() {
    // Show Zeltingen-specific controls
    BAWUtils.ui.toggleVisibility("zeltingenModelToggles", true);
    BAWUtils.ui.toggleVisibility("pointCloudControls", true);
  }

  applyTilesetQualitySettings(tileset, settings) {
    BAWUtils.utils.safeExecute(() => {
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
      this.hiddenFeatures.showAll();
    }
    
    // Reset hide mode
    if (this.hiddenFeatures.isHideMode) {
      this.hiddenFeatures.toggleHideMode();
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
      BAWUtils.ui.toggleVisibility(id, false);
    });

    // Reset checkboxes
    const checkboxes = [
      "citygmlToggle",
      "model3256557", "model3256547", "model3256555",
      "model3251780", "model3341583"
    ];
    
    checkboxes.forEach(id => {
      BAWUtils.ui.setChecked(id, false);
    });

    // Reset point cloud controls
    const pointSizeControl = BAWUtils.utils.getElement("pointSizeControl");
    if (pointSizeControl) pointSizeControl.value = "0.5";
    
    BAWUtils.ui.updateText("pointSizeValue", "Normal");
    BAWUtils.ui.setChecked("toggleAttenuation", true);
  }

  resetSceneState() {
    this.pointCloudAssets = [];
    this.assetIdToTilesetMap = {};
    this.hideInfoBox();
    this.hideAllPanels();
    this.currentGroup = null;
    this.comments.setCurrentGroup(null);
    
    this.comments.exitCommentMode();
    this.comments.updateCommentModeUI();

    if (this.measurements) {
      this.measurements.clearEntities();
      this.measurements.isActive = false;
      this.measurements.currentMode = null;
      this.measurements.activePoints = [];
      this.measurements.measurementEntities = [];
    }
  }

  // ===========================
  // Panel Management
  // ===========================
  togglePanel(type, show) {
    if (show) {
      this.showPanel(type);
    } else {
      this.hidePanel(type);
    }
  }

  showPanel(type) {
    const panel = BAWUtils.utils.getElement(`${type}Panel`);
    if (!panel) return;
    
    panel.style.display = "block";
    
    // Use setTimeout for animation instead of RAF to avoid context issues
    setTimeout(() => {
      if (type === "comments") {
        panel.style.transform = "translateY(-50%) translateX(100%)";
        panel.style.opacity = "0";
        
        setTimeout(() => {
          panel.style.transform = "translateY(-50%) translateX(0)";
          panel.style.opacity = "1";
        }, 10);
      } else {
        panel.style.opacity = "0";
        setTimeout(() => {
          panel.style.opacity = "1";
        }, 10);
      }
    }, 0);
    
    // Check collisions after animation
    setTimeout(() => this.checkPanelCollisions(), 350);
    
    // Panel-specific initialization
    if (type === "measure") {
      this.initMeasurePanel();
    } else if (type === "hiddenFeatures") {
      this.hiddenFeatures.updateDisplay();
    }

    // Manage open panels on mobile
    if (!(type === "measure" && window.innerWidth > 768)) {
      setTimeout(() => this.manageOpenPanels(), 100);
    }
  }

  hidePanel(type) {
    const panel = BAWUtils.utils.getElement(`${type}Panel`);
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
      this.hiddenFeatures.toggleHideMode();
    }
  }

  initMeasurePanel() {
    if (this.measurements) {
      this.measurements.isActive = false;
      this.measurements.currentMode = null;
      const select = BAWUtils.utils.getElement("measureModeSelect");
      if (select) select.value = "";
      this.measurements.updateDisplay();
    }
  }

  cleanupMeasurePanel() {
    if (this.measurements) {
      this.measurements.cancelCurrentMeasurement();
      this.measurements.isActive = false;
      this.measurements.currentMode = null;
    }
  }

  hideAllPanels() {
    ['comments', 'measure', 'hiddenFeatures'].forEach(type => {
      this.hidePanel(type);
      const toggle = BAWUtils.utils.getElement(`toggle${type.charAt(0).toUpperCase() + type.slice(1)}Panel`);
      if (toggle) toggle.checked = false;
    });
    this.hideInfoBox();
  }

  checkPanelCollisions() {
    const panels = {
      comments: BAWUtils.utils.getElement("commentsPanel"),
      measure: BAWUtils.utils.getElement("measurePanel"),
      info: BAWUtils.utils.getElement("infoBox")
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
      const panel = BAWUtils.utils.getElement(`${type}Panel`);
      return panel && panel.style.display !== "none";
    });
    
    if (openPanels.length > 1) {
      this.hidePanel("comments");
      BAWUtils.ui.showToast("Comments Panel geschlossen für bessere Übersicht", "info", 2000);
    }
  }

  handleResize() {
    this.checkPanelCollisions();
    
    const commentsPanel = BAWUtils.utils.getElement("commentsPanel");
    if (window.innerWidth <= 480 && commentsPanel) {
      commentsPanel.style.maxHeight = "40vh";
    }
  }

  showScenePanels() {
    BAWUtils.ui.toggleVisibility("panelToggles", true);
    
    ["toggleCommentsPanel", "toggleMeasurePanel"].forEach(id => {
      BAWUtils.ui.setEnabled(id, true);
    });
    
    console.log(`🎛️ Showing panels for scene: ${this.currentGroup?.name}`);
  }

  // ===========================
  // Click Handler
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
    const throttledMouseMove = BAWUtils.utils.throttle((movement) => {
      this.handleMouseMove(movement);
    }, 50);
    
    this.handler.setInputAction(throttledMouseMove, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  }

  handleLeftClick(click) {
    if (this.comments.isCommentMode) {
      this.comments.handleCommentModeClick(click);
    } else if (this.measurements && this.measurements.isActive) {
      this.measurements.handleClick(click);
    } else if (this.hiddenFeatures.isHideMode) {
      this.hiddenFeatures.handleClick(click, this.viewer);
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
      this.comments.zoomToComment(commentId);
    } else {
      this.hideInfoBox();
      this.currentSelectedFeature = null;
    }
  }

  handleMouseMove(movement) {
    if (this.comments.isCommentMode || (this.measurements && this.measurements.isActive) || this.hiddenFeatures.isHideMode) return;
    
    this.comments.handleMouseMove(movement);
  }

  // ===========================
  // Feature Info
  // ===========================
  showFeatureInfo(feature) {
    try {
      const info = this.extractFeatureInfo(feature);
      const content = this.buildFeatureInfoHTML(info);
      
      BAWUtils.ui.updateHTML("infoContent", content);
      BAWUtils.ui.toggleVisibility("infoBox", true);

    } catch (error) {
      BAWUtils.ui.handleError("Fehler beim Anzeigen der Feature-Information", error);
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
      const objektartenText = BAWUtils.config.objektartenMap[objektartenKennzahl] || "Wehranlagen";
      const objektteileText = BAWUtils.config.objektteileMap[objektartenKennzahl]?.[info.objektteileKennzahl] || "Verschlusskörper";

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
    BAWUtils.ui.toggleVisibility("infoBox", false);
    this.currentSelectedFeature = null;
  }

  hideCurrentFeature() {
    if (this.currentSelectedFeature) {
      this.hiddenFeatures.hideFeature(this.currentSelectedFeature);
      this.hideInfoBox();
    }
  }

  // ===========================
  // Model Toggle Methods
  // ===========================
  toggleModel(assetId, show) {
    console.log(`🔄 Toggling model ${assetId}: ${show ? 'SHOW' : 'HIDE'}`);
    
    const tileset = this.assetIdToTilesetMap[assetId];
    if (tileset) {
      tileset.show = show;
      
      const checkbox = document.querySelector(`[data-asset-id="${assetId}"]`);
      if (checkbox && checkbox.checked !== show) {
        checkbox.checked = show;
      }
      
      BAWUtils.ui.showToast(
        `${show ? 'Aktiviert' : 'Deaktiviert'}: Asset ${assetId}`, 
        'success', 
        2000
      );
    } else {
      console.error(`❌ No tileset found for asset ID: ${assetId}`);
      BAWUtils.ui.showToast(`Fehler: Modell ${assetId} nicht gefunden`, 'error');
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
          BAWUtils.ui.showToast(`${name} Test abgeschlossen!`, "success");
        }, 1000);
      }
    };
    
    BAWUtils.ui.showToast(`Starte ${name} Model-Test...`, "info");
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
    BAWUtils.ui.showToast(`Alle ${name}-Modelle angezeigt`, "success");
  }

  hideAllModels(assetIds, name) {
    console.log(`🙈 Hiding all ${name} models...`);
    assetIds.forEach(assetId => this.toggleModel(assetId, false));
    BAWUtils.ui.showToast(`Alle ${name}-Modelle versteckt`, "success");
  }

  // ===========================
  // Point Cloud Methods - WITHOUT EDL
  // ===========================
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
        
        // Ensure point cloud shading exists
        if (!tileset.pointCloudShading) {
          tileset.pointCloudShading = new Cesium.PointCloudShading();
        }
        
        this.applyPointCloudSettings(tileset);
      }
    });
    
    console.log(`✅ Found ${this.pointCloudAssets.length} point clouds`);
    
    if (this.pointCloudAssets.length > 0) {
      BAWUtils.ui.showToast(`${this.pointCloudAssets.length} Punktwolke(n) erkannt`, 'success');
    }
  }

  isPointCloudTileset(tileset, assetId) {
    const knownPointCloudIds = [3341583];
    
    // Check if it's a known point cloud ID
    if (knownPointCloudIds.includes(parseInt(assetId))) {
      return true;
    }
    
    // Check if tileset has point cloud properties
    if (tileset.pointCloudShading) {
      return true;
    }
    
    // Check if tileset root has point content
    if (tileset.root && tileset.root.content) {
      const content = tileset.root.content;
      // Check for point cloud indicators in the content
      if (content.pointsLength > 0 || content.geometryType === 'POINTS') {
        return true;
      }
    }
    
    return false;
  }

  applyPointCloudSettings(tileset) {
    if (!tileset.pointCloudShading) {
      tileset.pointCloudShading = new Cesium.PointCloudShading({
        attenuation: this.pointCloudSettings.attenuation,
        geometricErrorScale: 1.0,
        maximumAttenuation: this.pointCloudSettings.attenuation ? 4.0 : undefined,
        baseResolution: this.pointCloudSettings.attenuation ? 0.05 : undefined
      });
    } else {
      const shading = tileset.pointCloudShading;
      shading.attenuation = this.pointCloudSettings.attenuation;
      shading.geometricErrorScale = 1.0;
      
      // Attenuation settings
      if (this.pointCloudSettings.attenuation) {
        shading.maximumAttenuation = 4.0;
        shading.baseResolution = 0.05;
      } else {
        shading.maximumAttenuation = undefined;
        shading.baseResolution = undefined;
      }
    }
  }

  handlePointSizeChange(e) {
    const value = parseFloat(e.target.value);
    
    // Labels für Anzeige
    const labels = ['Sehr klein', 'Klein', 'Normal', 'Groß', 'Sehr groß'];
    const thresholds = [0.3, 0.4, 0.6, 1.0];
    let label = labels[labels.length - 1];
    
    for (let i = 0; i < thresholds.length; i++) {
      if (value <= thresholds[i]) {
        label = labels[i];
        break;
      }
    }
    
    BAWUtils.ui.updateText('pointSizeValue', label);
    
    this.pointCloudAssets.forEach(asset => {
      BAWUtils.utils.safeExecute(() => {
        if (asset.tileset.pointCloudShading) {
          asset.tileset.pointCloudShading.geometricErrorScale = value;
          
          if (this.pointCloudSettings.attenuation) {
            asset.tileset.pointCloudShading.baseResolution = value * 0.1;
            asset.tileset.pointCloudShading.maximumAttenuation = 2.0 + value * 3.0;
          }
        }
        
        const baseSSE = 16;
        asset.tileset.maximumScreenSpaceError = baseSSE / (value + 0.5);
        
      }, "Could not apply point size");
    });
    
    if (this.viewer?.scene) {
      this.viewer.scene.requestRender();
    }
    
    BAWUtils.ui.showToast(`Punktgröße: ${label}`, 'info', 1500);
  }

  handleAttenuationToggle(e) {
    this.pointCloudSettings.attenuation = e.target.checked;
    
    // Update all point clouds
    this.updateAllPointClouds();
    
    const status = e.target.checked ? 'AKTIVIERT' : 'DEAKTIVIERT';
    BAWUtils.ui.showToast(`Distance Attenuation: ${status}`, 'success', 2000);
  }

  updateAllPointClouds() {
    this.pointCloudAssets.forEach(asset => {
      this.applyPointCloudSettings(asset.tileset);
    });
    
    if (this.pointCloudAssets.length > 0 && this.viewer?.scene) {
      this.viewer.scene.requestRender();
    }
  }

  debugPointClouds() {
    console.log("🔧 Point Cloud Debug Info:");
    console.log("=====================================");
    console.log(`Point clouds detected: ${this.pointCloudAssets.length}`);
    console.log("Current settings:", this.pointCloudSettings);
    
    console.log("\n☁️ Point Cloud Details:");
    this.pointCloudAssets.forEach((asset, index) => {
      console.log(`\nPoint Cloud ${index + 1} (Asset ID: ${asset.assetId}):`);
      console.log(`├─ Visible: ${asset.tileset.show}`);
      console.log(`├─ Ready: ${asset.tileset.ready}`);
      console.log(`├─ Maximum Screen Space Error: ${asset.tileset.maximumScreenSpaceError}`);
      console.log(`├─ Points Loaded: ${asset.tileset.pointsLength || 'N/A'}`);
      console.log(`└─ Memory Usage (MB): ${(asset.tileset.totalMemoryUsageInBytes / 1048576).toFixed(2)}`);
      
      if (asset.tileset.pointCloudShading) {
        const shading = asset.tileset.pointCloudShading;
        console.log(`   Point Cloud Shading:`);
        console.log(`   ├─ attenuation: ${shading.attenuation}`);
        console.log(`   ├─ geometricErrorScale: ${shading.geometricErrorScale}`);
        console.log(`   ├─ maximumAttenuation: ${shading.maximumAttenuation || 'undefined'}`);
        console.log(`   └─ baseResolution: ${shading.baseResolution || 'undefined'}`);
      }
    });
    
    console.log("\n⚙️ Render Settings:");
    console.log(`- Resolution Scale: ${this.viewer.resolutionScale}`);
    console.log(`- FXAA Enabled: ${this.viewer.scene.postProcessStages?.fxaa?.enabled || false}`);
    console.log(`- Request Render Mode: ${this.viewer.scene.requestRenderMode}`);
    
    BAWUtils.ui.showToast("Debug-Info in Konsole (F12)", "info", 4000);
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
          BAWUtils.ui.showToast("Kein lokales Orthophoto verfügbar für diese Szene", "warning");
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
      BAWUtils.ui.showToast('Fehler beim Wechseln des Kartenhintergrunds: ' + error.message, 'error');
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

  // ===========================
  // User Settings
  // ===========================
  loadUserSettings() {
    const savedUserName = localStorage.getItem('baw_user_name');
    const savedRenderQuality = localStorage.getItem('baw_render_quality') || 'balanced';
    
    if (savedUserName) {
      const userNameInput = BAWUtils.utils.getElement('userName');
      if (userNameInput) userNameInput.value = savedUserName;
      this.userName = savedUserName;
      this.comments.setUserName(savedUserName);
    }
    
    const renderQualitySelect = BAWUtils.utils.getElement('renderQualitySelect');
    if (renderQualitySelect) renderQualitySelect.value = savedRenderQuality;
    
    this.setRenderQuality(savedRenderQuality, false);
    this.updateRenderQualityDescription(savedRenderQuality);
  }

  saveUserSettings() {
    const userNameInput = BAWUtils.utils.getElement('userName');
    if (userNameInput) {
      const userName = userNameInput.value;
      localStorage.setItem('baw_user_name', userName);
      this.userName = userName;
      this.comments.setUserName(userName);
    }
  }

  setRenderQuality(quality, save = true) {
    if (!BAWUtils.config.renderQualitySettings[quality]) {
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
    
    BAWUtils.ui.showToast(`Render-Qualität: ${BAWUtils.config.renderQualitySettings[quality].name}`, 'success', 3000);
  }

  updateRenderQualityDescription(quality) {
    const description = BAWUtils.utils.getElement('renderQualityDescription');
    if (description && BAWUtils.config.renderQualitySettings[quality]) {
      description.textContent = BAWUtils.config.renderQualitySettings[quality].description;
    }
  }

  applyRenderQualitySettings(quality) {
    const settings = BAWUtils.config.renderQualitySettings[quality].settings;
    
    BAWUtils.utils.safeExecute(() => {
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

  // ===========================
  // Cleanup
  // ===========================
  cleanup() {
    console.log("🧹 Cleaning up CesiumApp...");
    
    // Remove event listeners
    this._eventListeners.forEach(({ element, eventType, handler }) => {
      element.removeEventListener(eventType, handler);
    });
    this._eventListeners.clear();
    
    // Remove window listeners
    window.removeEventListener('resize', this._boundMethods.get('handleResize'));
    document.removeEventListener('keydown', this._boundMethods.get('handleKeydown'));
    
    // Clear caches
    BAWUtils.utils.clearElementCache();
    
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
  console.log("🌟 Initializing BAW Cesium App - v2.0.2 (Cesium 1.132) - EDL Removed");
  
  const app = new CesiumApp();
  
  // Make methods available globally for HTML onclick handlers
  window.cesiumApp = app;
  window.cesiumApp.zoomToComment = app.comments.zoomToComment.bind(app.comments);
  window.cesiumApp.openEditComment = app.comments.openEditComment.bind(app.comments);
  window.cesiumApp.deleteComment = app.comments.deleteComment.bind(app.comments);
  window.cesiumApp.showFeatureByIndex = app.hiddenFeatures.showFeatureByIndex.bind(app.hiddenFeatures);
  
  // Initialize the app
  app.init();
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    app.cleanup();
  });
});