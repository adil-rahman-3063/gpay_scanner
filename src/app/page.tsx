"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode, CameraDevice } from "html5-qrcode";
import { Camera, Check, AlertCircle, RefreshCw } from "lucide-react";
import { parseEmvcoQr } from "@/utils/emvco";
import pkg from "../../package.json";

export default function Home() {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const stopScanner = useCallback(async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.error("Error stopping scanner", err);
      }
      setIsScanning(false);
      setStatus("Idle");
    }
  }, []);

  const handleScanSuccess = useCallback(async (decodedText: string) => {
    setStatus("QR Code detected!");
    await stopScanner();
    
    const cleanPayload = decodedText.trim();
    const isAndroid = /Android/i.test(navigator.userAgent);

    const redirectWithGpayIntent = (url: string) => {
      if (isAndroid) {
        const intentUrl = url.replace("upi://", "intent://") + "#Intent;package=com.google.android.apps.nbu.paisa.user;scheme=upi;end";
        window.location.href = intentUrl;
      } else {
        // Use gpay:// custom scheme on iOS to bypass WhatsApp and go directly to the amount screen
        const iosUrl = url.replace("upi://", "gpay://upi/");
        window.location.href = iosUrl;
      }
    };

    if (cleanPayload.startsWith("upi://")) {
      // Case 1: Standard UPI Link
      redirectWithGpayIntent(cleanPayload);
    } else if (
      cleanPayload.startsWith("000201") || 
      cleanPayload.startsWith("000202") || 
      /^\d{20,}$/.test(cleanPayload)
    ) {
      // Case 2: Bank / EMVCo / BharatQR (e.g. South Indian Bank, HDFC, SBI, Paytm BharatQR)
      const parsedUpi = parseEmvcoQr(cleanPayload);
      if (parsedUpi) {
        redirectWithGpayIntent(parsedUpi);
      } else {
        const encodedPayload = encodeURIComponent(cleanPayload);
        const url = `upi://pay?qrPayload=${encodedPayload}`;
        redirectWithGpayIntent(url);
      }
    } else if (cleanPayload.startsWith("http://") || cleanPayload.startsWith("https://")) {
      // Case 3: Merchant URL
      window.location.href = cleanPayload;
    } else {
      // Case 4: Fallback
      try {
        await navigator.clipboard.writeText(cleanPayload);
        showToast("QR copied! Opening GPay...");
        
        setTimeout(() => {
          if (isAndroid) {
            window.location.href = "intent://#Intent;package=com.google.android.apps.nbu.paisa.user;end";
          } else {
            window.location.href = "gpay://";
          }
        }, 1000);
      } catch (err) {
        console.error("Clipboard copy failed", err);
        showToast("Failed to copy text", "error");
        window.location.href = "gpay://";
      }
    }
  }, [stopScanner]);

  useEffect(() => {
    async function getCameras() {
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length) {
          setDevices(cameras);
          
          const telephotoCam = cameras.find(d => 
            d.label.toLowerCase().includes("telephoto") || 
            d.label.toLowerCase().includes("back 1") ||
            d.label.toLowerCase().includes("lens 2")
          );

          if (telephotoCam) {
            setSelectedDeviceId(telephotoCam.id);
          } else {
            setSelectedDeviceId(cameras[cameras.length - 1].id);
          }
        }
      } catch (err) {
        console.error(err);
        setErrorMsg("Failed to access cameras. Please ensure permissions are granted and you are on HTTPS.");
      }
    }
    getCameras();

    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const requestPermissionsAndLoadDevices = async (): Promise<string | null> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Your browser does not support camera access or you are not on HTTPS.");
      }
      
      // Force prompt for camera permission
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      // Immediately stop the stream since we just wanted the permission
      stream.getTracks().forEach(track => track.stop());

      // Now we have permission, get the list of devices
      const updatedDevices = await Html5Qrcode.getCameras();
      setDevices(updatedDevices);
      
      const telephotoCam = updatedDevices.find(d => 
        d.label.toLowerCase().includes("telephoto") || 
        d.label.toLowerCase().includes("back 1") ||
        d.label.toLowerCase().includes("lens 2")
      );

      if (telephotoCam) {
        setSelectedDeviceId(telephotoCam.id);
        return telephotoCam.id;
      } else if (updatedDevices.length > 0) {
        setSelectedDeviceId(updatedDevices[updatedDevices.length - 1].id);
        return updatedDevices[updatedDevices.length - 1].id;
      }
      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Permission denied or no camera found", err);
      alert(`Camera Error: ${message}`);
      setErrorMsg(`Camera Error: ${message}`);
      return null;
    }
  };

  const startScanner = async () => {
    setErrorMsg("");
    
    let targetDeviceId = selectedDeviceId;

    if (!targetDeviceId) {
      setStatus("Requesting permissions...");
      targetDeviceId = await requestPermissionsAndLoadDevices() || "";
      if (!targetDeviceId) {
        setStatus("Idle");
        return;
      }
    }

    try {
      if (scannerRef.current?.isScanning) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      setStatus("Starting camera...");
      
      const config = {
        fps: 10,
        aspectRatio: 1.0,
        videoConstraints: { 
          deviceId: { exact: targetDeviceId }, 
          advanced: [{ zoom: 2.0 }] 
        } as unknown as MediaTrackConstraints
      };

      await html5QrCode.start(
        targetDeviceId,
        config,
        handleScanSuccess,
        () => {} // ignore frame scan misses
      );
      
      setIsScanning(true);
      setStatus("Scanning...");

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(err);
      setErrorMsg(`Error starting scanner: ${message}`);
      setStatus("Error");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center py-10 px-4 font-sans selection:bg-teal-500/30 justify-between">
      <div className="w-full max-w-md space-y-8">
        
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-teal-500/10 rounded-full mb-2">
            <Camera className="w-8 h-8 text-teal-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">GPay Cam</h1>
          <p className="text-neutral-400 text-sm">
            Force telephoto lens for high-res scanning.
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-xl space-y-4">
          
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Camera Device
            </label>
            <div className="relative">
              <select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                disabled={isScanning}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-teal-500/50 appearance-none disabled:opacity-50"
              >
                {devices.length === 0 && <option value="">Loading cameras...</option>}
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.label || `Camera ${device.id.substring(0, 5)}...`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={isScanning ? stopScanner : startScanner}
            className={`w-full py-3.5 px-4 rounded-xl font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
              isScanning 
                ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20" 
                : "bg-teal-500 text-neutral-950 hover:bg-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.3)]"
            }`}
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> Stop Scanning
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" /> Start 2x Camera
              </>
            )}
          </button>

          <div className="flex items-center justify-between pt-2 border-t border-neutral-800 text-sm">
            <span className="text-neutral-500">Status</span>
            <span className={`font-medium flex items-center gap-1.5 ${
              status === "Scanning..." ? "text-teal-400" : 
              status === "Error" ? "text-red-400" : 
              "text-neutral-300"
            }`}>
              {status === "Scanning..." && (
                <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              )}
              {status}
            </span>
          </div>
        </div>

        <div className="relative aspect-square w-full bg-black rounded-3xl overflow-hidden border border-neutral-800 shadow-2xl flex items-center justify-center">
          
          <div id="reader" className="w-full h-full flex items-center justify-center"></div>
          
          {!isScanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 bg-neutral-950/80 backdrop-blur-sm z-10 pointer-events-none">
              <Camera className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">Scanner inactive</p>
            </div>
          )}
          
          {isScanning && (
            <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
              <div className="w-[250px] h-[250px] border-2 border-teal-500/50 rounded-3xl relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-teal-400 rounded-tl-2xl -translate-x-1 -translate-y-1"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-teal-400 rounded-tr-2xl translate-x-1 -translate-y-1"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-teal-400 rounded-bl-2xl -translate-x-1 translate-y-1"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-teal-400 rounded-br-2xl translate-x-1 translate-y-1"></div>
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{errorMsg}</p>
          </div>
        )}
      </div>

      <footer className="w-full text-center py-4">
        <span className="text-xs text-neutral-600 font-mono tracking-wider">
          v{pkg.version}
        </span>
      </footer>

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full flex items-center gap-2 shadow-2xl animate-in fade-in slide-in-from-bottom-4 ${
          toast.type === "success" 
            ? "bg-teal-500/10 border border-teal-500/20 text-teal-400" 
            : "bg-red-500/10 border border-red-500/20 text-red-400"
        }`}>
          {toast.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
