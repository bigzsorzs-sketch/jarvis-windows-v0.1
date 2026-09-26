/**
 * OBD2 Data Processing Web Worker
 * Handles high-frequency telemetry without blocking the UI thread
 */

let tripData = [];
let sessionActive = false;

self.onmessage = async (event) => {
  const { type, data, command } = event.data;

  try {
    switch (command) {
      case 'START_SESSION':
        sessionActive = true;
        tripData = [];
        self.postMessage({ status: 'session_started' });
        break;

      case 'PROCESS_OBD_DATA':
        if (sessionActive) {
          const processed = processOBD2Data(data);
          tripData.push(processed);
          
          // Send batches every 10 readings
          if (tripData.length >= 10) {
            self.postMessage({ 
              status: 'data_batch', 
              data: tripData 
            });
            tripData = [];
          }
        }
        break;

      case 'END_SESSION':
        sessionActive = false;
        // Send remaining data
        if (tripData.length > 0) {
          self.postMessage({ 
            status: 'final_batch', 
            data: tripData 
          });
        }
        tripData = [];
        self.postMessage({ status: 'session_ended' });
        break;

      case 'ANALYZE_TREND':
        const analysis = analyzeTrend(data);
        self.postMessage({ 
          status: 'analysis_complete', 
          data: analysis 
        });
        break;

      default:
        self.postMessage({ error: 'Ismeretlen feldolgozási kérés érkezett.' });
    }
  } catch (error) {
    console.error('OBD2 worker error:', error);
    self.postMessage({ error: 'Az OBD2 feldolgozás közben hiba történt.' });
  }
};

function processOBD2Data(rawData) {
  return {
    timestamp: Date.now(),
    rpm: Math.max(0, Math.min(8000, rawData.rpm || 0)),
    coolantTemp: Math.max(-40, Math.min(120, rawData.coolantTemp || 0)),
    maf: Math.max(0, rawData.maf || 0),
    throttlePos: Math.max(0, Math.min(100, rawData.throttlePos || 0)),
    fuelTrim: rawData.fuelTrim || 0,
  };
}

function analyzeTrend(dataPoints) {
  if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
    return { error: 'Nincs elég adat az elemzéshez.' };
  }

  const rpmValues = dataPoints.map(d => d.rpm).filter(r => r > 0);
  const tempValues = dataPoints.map(d => d.coolantTemp);

  if (rpmValues.length === 0) {
    return { error: 'Nem érkezett érvényes RPM adat.' };
  }

  const avgRpm = rpmValues.reduce((a, b) => a + b) / rpmValues.length;
  const avgTemp = tempValues.reduce((a, b) => a + b) / tempValues.length;
  const maxRpm = Math.max(...rpmValues);
  const minRpm = Math.min(...rpmValues);

  // Detect anomalies
  const rpmVariance = maxRpm - minRpm;
  const hasHighRpmSpikes = rpmVariance > 2000;
  const hasHighTemp = avgTemp > 100;

  return {
    avgRpm: Math.round(avgRpm),
    avgTemp: Math.round(avgTemp * 10) / 10,
    maxRpm,
    minRpm,
    anomalies: {
      highRpmSpikes: hasHighRpmSpikes,
      highEngineTemp: hasHighTemp,
    },
    analysisTime: new Date().toISOString(),
  };
}