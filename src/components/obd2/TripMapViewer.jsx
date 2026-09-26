import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { X, Navigation2, AlertCircle } from 'lucide-react';
import L from 'leaflet';

// Custom markers
const problemIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iI2RjMzU0NSIvPjx0ZXh0IHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjEyIiB5PSIxNiIgZm9udC1zaXplPSIxMiIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IndoaXRlIj4hPC90ZXh0Pjwvc3ZnPg==',
  iconSize: [32, 32],
  popupAnchor: [0, -10],
});

const startIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iIzI4YTc0NSIvPjwvc3ZnPg==',
  iconSize: [32, 32],
  popupAnchor: [0, -10],
});

const endIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iIzAwN2JmZiIvPjwvc3ZnPg==',
  iconSize: [32, 32],
  popupAnchor: [0, -10],
});

function MapFitBounds({ coordinates }) {
  const map = useMap();

  useEffect(() => {
    if (coordinates && coordinates.length > 0) {
      const bounds = L.latLngBounds(
        coordinates.map((c) => [c.lat, c.lon])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [coordinates, map]);

  return null;
}

export default function TripMapViewer({ trip, onClose }) {
  if (!trip) return null;

  const { coordinates = [], obd2Data = [], startTime, endTime, distance } = trip;
  const routeCoordinates = coordinates.map((c) => [c.lat, c.lon]);

  // Find problem areas (high values)
  const problemMarkers = obd2Data.filter((d) => {
    if (d.metric === 'Motorolaj hőm.' && d.value > 110) return true;
    if (d.metric === 'RPM' && d.value > 6500) return true;
    if (d.metric === 'Turbónyomás' && d.value > 300) return true;
    return false;
  });

  const startCoord = coordinates[0];
  const endCoord = coordinates[coordinates.length - 1];

  const duration =
    startTime && endTime
      ? new Date(endTime) - new Date(startTime)
      : 0;
  const durationMinutes = Math.round(duration / 60000);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
      <div className="w-full max-w-2xl mx-auto bg-card rounded-t-3xl overflow-hidden flex flex-col h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-foreground">📍 Útvonal térkép</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {distance.toFixed(1)} km • {durationMinutes} perc
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-muted"
          >
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Map */}
        <div className="flex-1 overflow-hidden">
          {routeCoordinates.length > 0 ? (
            <MapContainer
              center={[
                (startCoord?.lat + (endCoord?.lat || startCoord?.lat)) / 2,
                (startCoord?.lon + (endCoord?.lon || startCoord?.lon)) / 2,
              ]}
              zoom={13}
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />

              {/* Route line */}
              <Polyline positions={routeCoordinates} color="#28a745" weight={4} opacity={0.7} />

              {/* Start marker */}
              {startCoord && (
                <Marker position={[startCoord.lat, startCoord.lon]} icon={startIcon}>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-semibold">🟢 Kezdés</p>
                      <p>{new Date(startCoord.timestamp).toLocaleTimeString('hu-HU')}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* End marker */}
              {endCoord && (
                <Marker position={[endCoord.lat, endCoord.lon]} icon={endIcon}>
                  <Popup>
                    <div className="text-xs">
                      <p className="font-semibold">🔵 Vég</p>
                      <p>{new Date(endCoord.timestamp).toLocaleTimeString('hu-HU')}</p>
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Problem markers */}
              {problemMarkers.map((problem, idx) => (
                <Marker
                  key={idx}
                  position={[problem.coordinate?.lat || 0, problem.coordinate?.lon || 0]}
                  icon={problemIcon}
                >
                  <Popup>
                    <div className="text-xs">
                      <p className="font-semibold flex items-center gap-1">
                        <AlertCircle size={12} />
                        {problem.metric}
                      </p>
                      <p className="text-red-500 font-bold">
                        {problem.value} {problem.unit}
                      </p>
                      <p className="text-muted-foreground">
                        {new Date(problem.timestamp).toLocaleTimeString('hu-HU')}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))}

              <MapFitBounds coordinates={coordinates} />
            </MapContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Nincs GPS adat az útvonalon</p>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="px-4 py-3 border-t border-border bg-secondary/30 shrink-0">
          <p className="text-xs text-muted-foreground">
            {problemMarkers.length > 0 && (
              <>
                ⚠️ {problemMarkers.length} problematikus pont az útvonalon
              </>
            )}
            {problemMarkers.length === 0 && (
              <>
                ✅ Nincsenek kritikus értékek az útvonalon
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}