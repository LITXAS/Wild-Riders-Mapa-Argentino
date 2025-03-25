// script.js (versión mejorada)
let map, userMarker, routeLayer, destinationMarker;
let searchHistory = [];
let poiLayers = [];
let popup; // Mover popup a variable global

// Constantes para configuración
const MAP_CONFIG = {
  initialCenter: [-63.6167, -38.4161],
  initialZoom: 15,
  poiTypes: [
    { type: 'amenity', value: 'fuel', name: 'Estación', color: '#FFD700', icon: '⛽' },
    { type: 'amenity', value: 'police', name: 'Policía', color: '#4169E1', icon: '🚓' },
    { type: 'amenity', value: 'restaurant', name: 'Restaurante', color: '#FF6347', icon: '🍴' },
    { type: 'amenity', value: 'bar', name: 'Bar', color: '#9370DB', icon: '🍺' },
    { type: 'amenity', value: 'hospital', name: 'Hospital', color: '#FF0000', icon: '🏥' },
    { type: 'tourism', value: 'hotel', name: 'Hotel', color: '#008000', icon: '🏨' }
  ]
};

// Estilos reutilizables
const STYLES = {
  userMarker: new ol.style.Style({
    image: new ol.style.Circle({
      radius: 8,
      fill: new ol.style.Fill({ color: '#4285F4' }),
      stroke: new ol.style.Stroke({ color: 'white', width: 2 })
    })
  }),
  destinationMarker: new ol.style.Style({
    image: new ol.style.Circle({
      radius: 8,
      fill: new ol.style.Fill({ color: '#FF0000' }),
      stroke: new ol.style.Stroke({ color: 'white', width: 2 })
    })
  }),
  route: new ol.style.Style({
    stroke: new ol.style.Stroke({ color: 'red', width: 3 })
  })
};

async function initMap() {
  try {
    // Inicializar mapa
    map = new ol.Map({
      target: 'map',
      layers: [new ol.layer.Tile({ source: new ol.source.OSM() })],
      view: new ol.View({
        center: ol.proj.fromLonLat(MAP_CONFIG.initialCenter),
        zoom: MAP_CONFIG.initialZoom
      })
    });

    // Configurar interacciones
    setupEventListeners();
    setupPopup();
    
    // Cargar ubicación del usuario
    initGeolocation();
    
    // Cargar POIs iniciales
    updatePOIMarkers();
    
  } catch (error) {
    console.error("Error al inicializar el mapa:", error);
    alert("Ocurrió un error al cargar el mapa. Por favor recarga la página.");
  }
}

function setupEventListeners() {
  // Evento para cerrar historial al hacer clic fuera
  document.addEventListener('click', (event) => {
    const historyContainer = document.getElementById('history-container');
    const historyButton = document.querySelector('[onclick="showHistory()"]');
    
    if (!historyContainer.contains(event.target) && event.target !== historyButton) {
      historyContainer.style.display = 'none';
    }
  });

  // Evento de búsqueda al presionar Enter
  document.getElementById('destination').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchRoute();
  });
}

function initGeolocation() {
  if (!navigator.geolocation) {
    alert("La geolocalización no está soportada en este navegador.");
    return;
  }

  const geolocationOptions = {
    enableHighAccuracy: true,
    timeout: 5000,
    maximumAge: 0
  };

  navigator.geolocation.watchPosition(
    position => updateUserLocation(position),
    error => handleLocationError(error),
    geolocationOptions
  );
}

function updateUserLocation(position) {
  const { latitude, longitude } = position.coords;
  const userCoords = ol.proj.fromLonLat([longitude, latitude]);
  
  if (!userMarker) {
    userMarker = new ol.Feature({
      geometry: new ol.geom.Point(userCoords),
      type: 'user'
    });
    
    const vectorSource = new ol.source.Vector({ features: [userMarker] });
    const vectorLayer = new ol.layer.Vector({
      source: vectorSource,
      style: STYLES.userMarker
    });
    
    map.addLayer(vectorLayer);
    map.getView().setCenter(userCoords);
  } else {
    userMarker.getGeometry().setCoordinates(userCoords);
  }
}

function searchRoute() {
  const destinationInput = document.getElementById('destination');
  const destination = destinationInput.value.trim();
  
  if (!destination) {
    showAlert("Por favor, ingresa un destino.");
    destinationInput.focus();
    return;
  }

  showLoading(true);
  
  geocodeDestination(destination)
    .then(destCoords => {
      if (!destCoords) {
        showAlert("Destino no encontrado.");
        return;
      }
      drawRoute(destCoords);
      saveToHistory(destination, destCoords);
    })
    .catch(error => {
      console.error("Error en la búsqueda de ruta:", error);
      showAlert("Ocurrió un error al buscar la ruta.");
    })
    .finally(() => showLoading(false));
}

async function geocodeDestination(destination) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`);
    const data = await response.json();
    return data.length > 0 ? { lat: data[0].lat, lng: data[0].lon } : null;
  } catch (error) {
    console.error("Error en geocodificación:", error);
    return null;
  }
}

function drawRoute(destCoords) {
  const userCoords = userMarker.getGeometry().getCoordinates();
  const destPoint = ol.proj.fromLonLat([parseFloat(destCoords.lng), parseFloat(destCoords.lat)]);
  
  // Actualizar o crear marcador de destino
  if (!destinationMarker) {
    destinationMarker = new ol.Feature({
      geometry: new ol.geom.Point(destPoint),
      type: 'destination'
    });
    
    const vectorSource = new ol.source.Vector({ features: [destinationMarker] });
    const vectorLayer = new ol.layer.Vector({
      source: vectorSource,
      style: STYLES.destinationMarker
    });
    
    map.addLayer(vectorLayer);
  } else {
    destinationMarker.getGeometry().setCoordinates(destPoint);
  }

  // Obtener y dibujar ruta
  fetchRoute(ol.proj.toLonLat(userCoords), destCoords)
    .then(route => {
      if (routeLayer) map.removeLayer(routeLayer);
      
      const format = new ol.format.GeoJSON();
      const routeFeature = format.readFeature(
        { type: 'Feature', geometry: route },
        { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }
      );
      
      routeLayer = new ol.layer.Vector({
        source: new ol.source.Vector({ features: [routeFeature] }),
        style: STYLES.route
      });
      
      map.addLayer(routeLayer);
    });
}

async function fetchRoute(start, end) {
  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.lng},${end.lat}?overview=full&geometries=geojson`
    );
    const data = await response.json();
    return data.routes?.[0]?.geometry || null;
  } catch (error) {
    console.error("Error al obtener ruta:", error);
    return null;
  }
}

function updatePOIMarkers() {
  // Limpiar POIs anteriores
  poiLayers.forEach(layer => map.removeLayer(layer));
  poiLayers = [];

  const extent = map.getView().calculateExtent(map.getSize());
  const [minX, minY, maxX, maxY] = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

  MAP_CONFIG.poiTypes.forEach(poi => {
    const overpassQuery = buildOverpassQuery(poi, minY, minX, maxY, maxX);
    fetchPOIData(overpassQuery, poi);
  });
}

function buildOverpassQuery(poi, minY, minX, maxY, maxX) {
  return `[out:json];(
    node[${poi.type}=${poi.value}](${minY},${minX},${maxY},${maxX});
    way[${poi.type}=${poi.value}](${minY},${minX},${maxY},${maxX});
    relation[${poi.type}=${poi.value}](${minY},${minX},${maxY},${maxX});
  );out center;`;
}

async function fetchPOIData(query, poi) {
  try {
    const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    const data = await response.json();
    createPOIMarkers(data.elements, poi);
  } catch (error) {
    console.error(`Error cargando POIs de tipo ${poi.value}:`, error);
  }
}

function createPOIMarkers(elements, poi) {
  const poiFeatures = elements
    .map(element => {
      const coords = element.type === 'node' ? 
        [element.lon, element.lat] : 
        (element.center ? [element.center.lon, element.center.lat] : null);
      
      return coords ? new ol.Feature({
        geometry: new ol.geom.Point(ol.proj.fromLonLat(coords)),
        type: poi.value,
        name: element.tags?.name || `${poi.name} ${element.id}`,
        poiType: poi.name
      }) : null;
    })
    .filter(Boolean);

  if (poiFeatures.length > 0) {
    const vectorSource = new ol.source.Vector({ features: poiFeatures });
    const vectorLayer = new ol.layer.Vector({
      source: vectorSource,
      style: createPOIStyle(poi)
    });
    
    map.addLayer(vectorLayer);
    poiLayers.push(vectorLayer);
  }
}

function createPOIStyle(poi) {
  return function(feature) {
    return new ol.style.Style({
      text: new ol.style.Text({
        text: feature.get('name') ? poi.icon : '',
        font: 'bold 16px Arial',
        fill: new ol.style.Fill({ color: poi.color }),
        stroke: new ol.style.Stroke({ color: 'white', width: 2 }),
        offsetY: -20
      }),
      image: new ol.style.Circle({
        radius: 6,
        fill: new ol.style.Fill({ color: poi.color }),
        stroke: new ol.style.Stroke({ color: 'white', width: 1 })
      })
    });
  };
}

function setupPopup() {
  popup = document.createElement('div');
  popup.className = 'ol-popup';
  popup.innerHTML = `
    <a href="#" class="ol-popup-closer" aria-label="Cerrar">×</a>
    <div id="popup-content"></div>
  `;
  document.body.appendChild(popup);
  
  document.querySelector('.ol-popup-closer').addEventListener('click', () => {
    popup.style.display = 'none';
    return false;
  });
  
  map.on('click', (evt) => {
    const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => 
      f && f.get('type') && !['user', 'destination'].includes(f.get('type'))
    );
    
    if (feature) {
      showPopup(feature, evt.pixel);
    } else {
      popup.style.display = 'none';
    }
  });

  map.on('pointermove', (e) => {
    const pixel = map.getEventPixel(e.originalEvent);
    const hit = map.hasFeatureAtPixel(pixel, {
      layerFilter: layer => poiLayers.includes(layer)
    });
    map.getTarget().style.cursor = hit ? 'pointer' : '';
  });
}

function showPopup(feature, pixel) {
  const type = feature.get('poiType') || feature.get('type');
  const name = feature.get('name');
  
  document.getElementById('popup-content').innerHTML = `
    <h4>${name}</h4>
    <p>Tipo: ${type}</p>
  `;
  
  popup.style.display = 'block';
  popup.style.left = `${pixel[0] - 100}px`;
  popup.style.top = `${pixel[1] - 100}px`;
}

function showLoading(show) {
  const button = document.querySelector('.search-container button');
  button.disabled = show;
  button.innerHTML = show ? 
    '<span class="spinner"></span> Buscando...' : 
    'Buscar Ruta';
}

function showAlert(message) {
  alert(message);
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', initMap);