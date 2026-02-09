/**
 * Server-Sent Events (SSE) stream voor live call meldingen
 * Gebruikt een in-memory event emitter om calls naar alle verbonden clients te pushen
 */

export interface CallEvent {
  type: "call-ringing" | "call-ended" | "call-update";
  data: {
    callId: string;
    timestamp: string;
    status: string;
    reason?: string;
    direction: string;
    callerNumber: string;
    callerName?: string;
    destinationNumber: string;
    destinationUser?: string;
    mauticContactId?: number;
    contactName?: string;
    contactFound: boolean;
  };
}

type CallEventListener = (event: CallEvent) => void;

class CallEventEmitter {
  private listeners: Set<CallEventListener> = new Set();

  subscribe(listener: CallEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: CallEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("SSE listener fout:", error);
      }
    });
  }

  get connectionCount(): number {
    return this.listeners.size;
  }
}

// Singleton event emitter - gedeeld door alle API routes
export const callEmitter = new CallEventEmitter();
