'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Operation } from '@/lib/operation-status';

interface OperationNotificationsContextType {
  operations: Operation[];
  isOpen: boolean;
  toggle: () => void;
}

const OperationNotificationsContext = createContext<
  OperationNotificationsContextType | undefined
>(undefined);

export function OperationNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  useEffect(() => {
    const eventSource = new EventSource('/api/operations/stream');

    eventSource.addEventListener('connected', event => {
      const data = JSON.parse(event.data);
      const currentOps = data.operations || [];
      setOperations(currentOps);
      if (currentOps.length > 0) {
        setIsOpen(true);
      }
    });

    eventSource.addEventListener('operation:created', event => {
      const operation: Operation = JSON.parse(event.data);
      setOperations(prev => {
        if (prev.find(op => op.id === operation.id)) {
          return prev;
        }
        return [...prev, operation];
      });
    });

    eventSource.addEventListener('operation:updated', event => {
      const operation: Operation = JSON.parse(event.data);
      setOperations(prev =>
        prev.map(op => (op.id === operation.id ? operation : op))
      );
    });

    eventSource.addEventListener('operation:removed', event => {
      const data = JSON.parse(event.data);
      setOperations(prev => prev.filter(op => op.id !== data.id));
    });

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const contextValue = {
    operations,
    isOpen,
    toggle,
  };

  return (
    <OperationNotificationsContext.Provider value={contextValue}>
      {children}
    </OperationNotificationsContext.Provider>
  );
}

export function useOperationNotifications() {
  const context = useContext(OperationNotificationsContext);
  if (context === undefined) {
    throw new Error(
      'useOperationNotifications must be used within an OperationNotificationsProvider'
    );
  }
  return context;
}
