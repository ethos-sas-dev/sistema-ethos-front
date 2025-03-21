"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../_lib/auth/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../_components/ui/card";
import { Badge } from "../../_components/ui/badge";
import { Button } from "../../_components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../_components/ui/tabs";
import { Loader2, Mail, AlertTriangle, ListFilter, ArrowDown, ArrowUp, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { EmailModal } from "./_components/email-modal";
import { EmailList } from "./_components/email-list";
import { EmailStats } from "./_components/email-stats";
import { TableSkeleton } from "./_components/TableSkeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../_components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../_components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../../_components/ui/pagination";
import { Input } from "../../_components/ui/input";
import { useEmails } from "../_hooks/useEmails";
import type { Email } from "../_hooks/useEmails";
// Importar las utilidades de limpieza de texto para emails
import { cleanEmailString } from "../../utils/email-formatters";

// Interfaz para las props del modal de progreso
interface SyncProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: string;
  lastLog?: string;
}

// Modal de progreso simplificado - solo loader con mensajes
function SyncProgressModal({ isOpen, onClose, status = '', lastLog = '' }: SyncProgressModalProps) {
  if (!isOpen) return null;
  
  // Determinar si el proceso está completado basado en el status
  const isCompleted = 
    status.toLowerCase().includes('completada') || 
    status.toLowerCase().includes('finalizada') ||
    status.toLowerCase().includes('no se encontraron');
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold flex items-center">
            {isCompleted ? 'Sincronización completada' : 'Sincronizando correos'}
            {!isCompleted && (
              <span className="ml-2 h-4 w-4 bg-blue-500 rounded-full animate-pulse"></span>
            )}
          </h2>
          
          {/* Indicador visual del estado */}
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                Completado
              </span>
            ) : (
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium animate-pulse">
                En progreso
              </span>
            )}
          </div>
        </div>
        
        {/* Loader circular en el centro */}
        <div className="flex flex-col items-center justify-center my-8">
          {!isCompleted ? (
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          ) : (
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          <p className="text-sm font-medium text-center">{status.includes('Buscando') ? `${status}, esto puede tardar hasta 3 minutos...` : `${status}`}</p>
        </div>
        
        {/* Último mensaje de log */}
        {/* <div className="bg-gray-100 dark:bg-gray-900 p-3 rounded-md mb-4 font-mono text-sm overflow-y-auto">
          <p className="text-gray-800 dark:text-gray-200">{lastLog}</p>
        </div> */}
        
        <div className="text-right">
          <button
            onClick={() => onClose()}
            disabled={!isCompleted}
            className={`px-4 py-2 font-semibold rounded-md text-sm ${
              isCompleted
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {isCompleted ? "Cerrar" : "Sincronizando..."}
          </button>
        </div>
      </div>
    </div>
  );
}

// Definir el tipo EmailStatus basado en el tipo de Email.status
type EmailStatus = "necesitaAtencion" | "informativo" | "respondido";

// Opciones de cantidad para mostrar
const displayOptions = [10, 20, 50, 100];

// Extender la interfaz Email para incluir los campos adicionales que necesitamos
interface ExtendedEmail extends Email {
  to?: string;
  fullContent?: string;
}

export default function CorreosPage() {
  const { user, role } = useAuth();
  const router = useRouter();
  
  // Usar el hook de emails con SWR
  const { 
    emails, 
    stats, 
    isLoading, 
    isRefreshing, 
    error, 
    refreshEmails, 
    updateEmail 
  } = useEmails({ 
    // Desactivar refresco automático para evitar el efecto "tieso"
    refreshInterval: undefined,
    revalidateOnFocus: false
  });

  const [selectedEmail, setSelectedEmail] = useState<ExtendedEmail | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("necesitaAtencion");
  const [totalEmails, setTotalEmails] = useState(0);
  const [displayLimit, setDisplayLimit] = useState(20);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [localSortOrder, setLocalSortOrder] = useState<"asc" | "desc">("desc");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const renderCountRef = useRef<{[key: string]: number}>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  
  // Estados para el seguimiento de la sincronización
  const [syncStatus, setSyncStatus] = useState('');
  const [syncLastLog, setSyncLastLog] = useState('');
  const [showSyncProgress, setShowSyncProgress] = useState(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Verificar si el usuario tiene permisos para ver esta página
  useEffect(() => {
    // Si no hay usuario o no está autorizado, redirigir
    if (user) {
      const isAuthorized = 
        user.email === 'administraciona3@almax.ec' || 
        user.username === 'administraciona3';
      
      if (!isAuthorized) {
        // Redirigir al dashboard si no tiene permisos
        router.push('/dashboard');
      }
    }
  }, [user, router]);

  // Si el usuario no tiene el correo correcto, mostrar mensaje
  if (user && user.email !== 'administraciona3@almax.ec' && user.username !== 'administraciona3') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] p-4 text-center">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Acceso restringido</h1>
        <p className="text-gray-600 max-w-md">
          Este módulo solo está disponible para el usuario administrador del correo administraciona3@almax.ec.
        </p>
        <Button 
          className="mt-6" 
          onClick={() => router.push('/dashboard')}
        >
          Volver al dashboard
        </Button>
      </div>
    );
  }

  // Función para manejar el cambio de ordenación
  const handleSortChange = (order: "asc" | "desc") => {
    // Log para debugging
    console.log(`Cambiando orden local a ${order}`);
    
    // Solo cambiamos la ordenación local que afecta a los correos de la página actual
    setLocalSortOrder(order);
  };

  // Obtener el valor de ordenación para EmailList
  const getListSortOrder = (): "asc" | "desc" => {
    return localSortOrder;
  };

  // Efecto para calcular el total de emails
  useEffect(() => {
    setTotalEmails(emails.length);
  }, [emails]);

  // Cambiar el límite de correos mostrados sin recargar
  const handleDisplayLimitChange = (value: string) => {
    setDisplayLimit(Number(value));
  };

  // Modificar el filtrado de correos para incluir la búsqueda
  const filteredEmails = useMemo(() => {
    // Controlar logs duplicados
    renderCountRef.current['filteredEmails'] = (renderCountRef.current['filteredEmails'] || 0) + 1;
    if (renderCountRef.current['filteredEmails'] % 2 === 1) { // Solo mostrar en renderizados impares
      console.log("Recalculando emails filtrados con orden:", sortOrder);
    }
    
    // Primero filtramos por estado
    let filtered = emails.filter((email) => email.status === activeTab);
    
    // Luego filtramos por búsqueda si hay una consulta
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((email) => 
        email.subject.toLowerCase().includes(query) || 
        email.from.toLowerCase().includes(query)
      );
    }
    
    // Aplicamos el orden general para determinar qué correos van en qué página
    return [...filtered].sort((a, b) => {
      const dateA = new Date(a.receivedDate).getTime();
      const dateB = new Date(b.receivedDate).getTime();
      // Aplicar el criterio de ordenación según sortOrder
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [emails, activeTab, sortOrder, searchQuery]);

  // Calcular el número total de páginas
  const totalPages = useMemo(() => {
    return Math.ceil(filteredEmails.length / displayLimit);
  }, [filteredEmails.length, displayLimit]);

  // Obtener los correos para la página actual basados en el límite de visualización
  const paginatedEmails = useMemo(() => {
    const startIndex = (currentPage - 1) * displayLimit;
    const endIndex = startIndex + displayLimit;
    return filteredEmails.slice(startIndex, endIndex);
  }, [filteredEmails, currentPage, displayLimit]);
  
  // Correos a mostrar con ordenación local aplicada
  const emailsToDisplay = useMemo(() => {
    // Aplicamos la ordenación local SOLO a los correos de la página actual
    return [...paginatedEmails].sort((a, b) => {
      const dateA = new Date(a.receivedDate).getTime();
      const dateB = new Date(b.receivedDate).getTime();
      // Aplicar ordenación local
      return localSortOrder === "desc" ? dateB - dateA : dateA - dateB;
    });
  }, [paginatedEmails, localSortOrder]);

  // Obtener el conteo de emails por categoría de manera optimizada
  const emailCount = useMemo(() => 
    emails.filter(email => email.status === activeTab).length,
  [emails, activeTab]);
  
  // Callback para actualizar la pestaña activa de manera optimizada
  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
  }, []);
  
  /**
   * Manejador para actualizar el estado de un correo
   * Implementación optimista: actualiza la UI inmediatamente y envía la petición en segundo plano
   */
  const handleUpdateStatus = async (emailId: string, newStatus: EmailStatus) => {
    // Encontrar el correo a actualizar en la lista local
    // Buscar por emailId en lugar de id
    const emailToUpdate = emails.find(email => email.emailId === emailId);
    if (!emailToUpdate) {
      console.error(`No se encontró el correo con ID ${emailId}`);
      return;
    }
    
    // Guardar el estado anterior para posible rollback
    const oldStatus = emailToUpdate.status;
    const willChangeTabs = oldStatus !== newStatus;
    
    // Evitar cambios redundantes
    if (oldStatus === newStatus) {
      console.log(`El correo ${emailId} ya está en estado ${newStatus}, ignorando actualización`);
      return;
    }
    
    // ACTUALIZACIÓN OPTIMISTA: Actualizar el estado local inmediatamente sin esperar respuesta
    console.log(`Actualizando optimistamente correo ${emailId} de ${oldStatus} a ${newStatus}`);
    
    // IMPORTANTE: Actualizamos inmediatamente el correo en la memoria local
    // para que desaparezca de la vista actual si es necesario
    updateEmail(emailId, { status: newStatus });
    
    // Mostrar notificación de éxito inmediatamente (optimista)
    const statusLabels: Record<EmailStatus, string> = {
      'necesitaAtencion': 'necesita atención',
      'informativo': 'informativo',
      'respondido': 'respondido'
    };
    
    // Usar el evento correcto para las notificaciones
    dispatchEvent(
      new CustomEvent('showNotification', {
        detail: {
          type: 'success',
          title: 'Estado actualizado',
          message: `El correo ha sido marcado como "${statusLabels[newStatus]}"`,
        },
      })
    );
    
    // Cerrar el modal si está abierto
    if (modalOpen) {
      setModalOpen(false);
    }
    
    // Actualizar la última fecha de actualización
    setLastUpdated(new Date());
    
    // Generar un ID único para esta actualización para depuración
    const updateId = Date.now().toString().slice(-6);
    
    // ENVIAR LA ACTUALIZACIÓN AL SERVIDOR EN SEGUNDO PLANO
    // La respuesta ya no bloqueará la interfaz de usuario
    try {
      console.log(`🔄 [${updateId}] Enviando actualización al servidor: ${emailId} → ${newStatus}`);
      
      // Usar promesa con timeout para evitar esperas infinitas
      const fetchPromise = fetch('/api/emails/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          emailId, 
          status: newStatus,
          skipRefresh: true // Indicar al servidor que no refresque la caché
        }),
        cache: 'no-store'
      });
      
      // Crear un timeout de 15 segundos
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout al actualizar estado')), 15000)
      );
      
      // Esperar a la primera promesa que se resuelva (fetch o timeout)
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (!response.ok) {
        throw new Error(`Error al actualizar estado en el servidor: ${response.status}`);
      }
      
      console.log(`✅ [${updateId}] Actualización confirmada por el servidor: ${emailId} a ${newStatus}`);
      // No necesitamos hacer nada más, la UI ya está actualizada
    } catch (error) {
      console.error(`❌ [${updateId}] Error al actualizar estado en el servidor:`, error);
      
      // En caso de error del servidor, revertir el cambio local
      console.log(`⏪ [${updateId}] Revirtiendo cambio optimista debido a error: ${emailId} de ${newStatus} a ${oldStatus}`);
      updateEmail(emailId, { status: oldStatus });
      
      // Mostrar notificación de error
      dispatchEvent(
        new CustomEvent('showNotification', {
          detail: {
            message: 'Error al actualizar el estado del correo en el servidor. Se ha revertido el cambio.',
            type: 'error',
            title: 'Error'
          }
        })
      );
    }
  };
  
  // Usar esta función para abrir un correo y asegurarse de que su contenido esté limpio
  const handleOpenEmail = (email: Email) => {
    // Convertir a ExtendedEmail y limpiar los campos
    const extendedEmail = email as ExtendedEmail;
    
    // Limpiar los campos del correo seleccionado
    const cleanedEmail: ExtendedEmail = {
      ...extendedEmail,
      from: cleanEmailString(extendedEmail.from),
      subject: cleanEmailString(extendedEmail.subject),
      preview: cleanEmailString(extendedEmail.preview),
      // Estos campos pueden no existir en todos los correos
      to: extendedEmail.to ? cleanEmailString(extendedEmail.to) : undefined,
      fullContent: extendedEmail.fullContent ? cleanEmailString(extendedEmail.fullContent) : extendedEmail.preview
    };
    
    setSelectedEmail(cleanedEmail);
    setModalOpen(true);
  };

  // Marcar correo como informativo
  const handleMarkAsInformative = async (emailId: string) => {
    handleUpdateStatus(emailId, "informativo");
  };

  // Marcar correo como respondido
  const handleMarkAsResponded = async (emailId: string) => {
    handleUpdateStatus(emailId, "respondido");
  };

  // Marcar como necesita atención
  const handleMarkAsNeedsAttention = async (emailId: string) => {
    handleUpdateStatus(emailId, "necesitaAtencion");
  };

  // Manejar refresh de correos - versión simplificada
  const handleRefresh = async () => {
    // Prevenir múltiples refrescos si ya hay uno en progreso
    if (isRefreshing || syncIntervalRef.current !== null) return;
    
    try {
      // Reiniciar estados de progreso
      setSyncStatus('Buscando nuevos correos');
      setSyncLastLog('Buscando nuevos correos...');
      setShowSyncProgress(true);
      
      // Iniciar la sincronización simplificada
      console.log("🔄 Iniciando sincronización de correos nuevos");
      
      // Hacer la petición para obtener solo los nuevos correos con un timeout más largo
      // y manejo de errores mejorado
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minutos de timeout
      
      try {
        const response = await fetch('/api/emails/fetch?refresh=true&onlyNew=true', {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        clearTimeout(timeoutId); // Limpiar el timeout si la petición fue exitosa
        
        if (!response.ok) {
          // Si el servidor responde con error, mostrar mensaje específico
          let errorMessage = `Error ${response.status}: ${response.statusText}`;
          
          try {
            // Intentar obtener detalles del error en el cuerpo
            const errorBody = await response.text();
            if (errorBody) {
              try {
                // Intentar parsear como JSON
                const errorJson = JSON.parse(errorBody);
                if (errorJson.error) {
                  errorMessage = errorJson.error;
                }
              } catch (parseError) {
                // Si no es JSON, usar el texto como está si es razonable
                if (errorBody.length < 100) {
                  errorMessage = errorBody;
                }
              }
            }
          } catch (textError) {
            // Ignorar errores al leer el texto
          }
          
          throw new Error(errorMessage);
        }
        
        // Parsear la respuesta con manejo de errores
        let result;
        try {
          result = await response.json();
        } catch (jsonError) {
          console.error("Error al parsear respuesta JSON:", jsonError);
          throw new Error("Error al procesar la respuesta del servidor");
        }
        
        if (result.newEmails && result.newEmails.length > 0) {
          setSyncStatus(`Procesando ${result.newEmails.length} correos nuevos...`);
          setSyncLastLog(`Encontrados ${result.newEmails.length} correos nuevos`);
          
          // Configurar intervalo para verificar el progreso
          if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
          }
          
          syncIntervalRef.current = setInterval(async () => {
            try {
              const statusResponse = await fetch('/api/emails/sync-status', {
                headers: {
                  'Cache-Control': 'no-cache',
                  'Pragma': 'no-cache'
                }
              });
              
              if (!statusResponse.ok) {
                console.warn("Error al obtener estado de sincronización:", statusResponse.status);
                return;
              }
              
              let syncState;
              try {
                syncState = await statusResponse.json();
              } catch (e) {
                console.error("Error al parsear estado de sincronización:", e);
                return;
              }
              
              if (syncState) {
                // Actualizar la UI con datos reales
                if (syncState.status) {
                  setSyncStatus(syncState.status);
                }
                
                if (syncState.lastLog) {
                  setSyncLastLog(syncState.lastLog);
                }
                
                // Si la sincronización se completó, detener el intervalo
                if (syncState.completed && !syncState.inProgress) {
                  // Detener el monitoreo
                  stopSyncMonitoring();
                  
                  // Actualizar los emails en el cliente
                  try {
                    await refreshEmails();
                  } catch (refreshError) {
                    console.error("Error al refrescar emails:", refreshError);
                    // Continuar a pesar del error, para no bloquear al usuario
                  }
                  
                  // Actualizar fecha de última sincronización
                  setLastUpdated(new Date());
                  
                  // Mostrar notificación de éxito
                  dispatchEvent(
                    new CustomEvent('showNotification', {
                      detail: {
                        message: 'Se han sincronizado los correos correctamente',
                        type: 'success',
                        title: 'Sincronización Completada'
                      }
                    })
                  );
                }
              }
            } catch (error) {
              console.error("Error al consultar estado de sincronización:", error);
            }
          }, 2000); // Intervalo más largo (2 segundos) para reducir la carga
        } else {
          // No hay correos nuevos
          setSyncStatus('No se encontraron correos nuevos');
          setSyncLastLog('Sincronización completada. No hay correos nuevos.');
          
          setTimeout(() => {
            stopSyncMonitoring();
            setShowSyncProgress(false);
            
            // Mostrar notificación
            dispatchEvent(
              new CustomEvent('showNotification', {
                detail: {
                  message: 'No se encontraron correos nuevos',
                  type: 'info',
                  title: 'Sincronización Completada'
                }
              })
            );
          }, 2000);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Manejar el error específico de timeout (AbortError)
        if (fetchError && typeof fetchError === 'object' && 'name' in fetchError && fetchError.name === 'AbortError') {
          throw new Error("La operación ha tardado demasiado tiempo. Esto puede ocurrir cuando hay muchos correos.");
        }
        
        throw fetchError;
      }
    } catch (error) {
      console.error('Error al iniciar la sincronización:', error);
      stopSyncMonitoring();
      
      // Determinar mensaje de error para el usuario
      let userErrorMessage = 'Error al sincronizar los correos';
      if (error instanceof Error) {
        userErrorMessage = error.message;
      }
      
      setSyncStatus(`Error: ${userErrorMessage}`);
      
      // Mostrar notificación de error
      dispatchEvent(
        new CustomEvent('showNotification', {
          detail: {
            message: userErrorMessage,
            type: 'error',
            title: 'Error'
          }
        })
      );
      
      // No cerrar el modal en caso de error, permitir al usuario verlo
      // y cerrar manualmente cuando quiera
    }
  };

  // Establecer la fecha de última actualización al cargar los correos
  useEffect(() => {
    if (emails.length > 0 && !lastUpdated) {
      setLastUpdated(new Date());
    }
  }, [emails, lastUpdated]);

  // Formatear la fecha de última actualización
  const formattedLastUpdated = useMemo(() => {
    if (!lastUpdated) return '';
    
    // Formatear la fecha en español
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(lastUpdated);
  }, [lastUpdated]);

  // Función para generar números de página con elipsis
  const generatePaginationItems = useMemo(() => {
    const items: (number|string)[] = [];
    
    // Si hay pocas páginas, mostrar todas
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        items.push(i);
      }
      return items;
    }
    
    // Siempre mostrar la primera página
    items.push(1);
    
    // Calcular rango de páginas a mostrar
    let startPage = Math.max(2, currentPage - 1);
    let endPage = Math.min(totalPages - 1, currentPage + 1);
    
    // Ajustar para mostrar 3 páginas en el medio
    if (startPage === 2) {
      endPage = Math.min(totalPages - 1, 4);
    } else if (endPage === totalPages - 1) {
      startPage = Math.max(2, totalPages - 3);
    }
    
    // Añadir elipsis antes del rango si es necesario
    if (startPage > 2) {
      items.push('ellipsis-start');
    }
    
    // Añadir páginas del rango
    for (let i = startPage; i <= endPage; i++) {
      items.push(i);
    }
    
    // Añadir elipsis después del rango si es necesario
    if (endPage < totalPages - 1) {
      items.push('ellipsis-end');
    }
    
    // Siempre mostrar la última página
    if (totalPages > 1) {
      items.push(totalPages);
    }
    
    return items;
  }, [currentPage, totalPages]);

  // Función para cambiar de página
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Función para manejar la búsqueda
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1); // Resetear a la primera página cuando se busca
  };

  // Efecto para ajustar la página actual cuando cambian los datos o el límite
  useEffect(() => {
    // Si no hay emails o la página actual está más allá del último correo,
    // ajustar a la última página válida
    if (filteredEmails.length > 0) {
      const maxValidPage = Math.ceil(filteredEmails.length / displayLimit);
      if (currentPage > maxValidPage) {
        console.log(`Ajustando página actual de ${currentPage} a ${maxValidPage} porque no hay suficientes correos`);
        setCurrentPage(maxValidPage);
      }
    } else {
      // Si no hay correos, ir a la página 1
      if (currentPage !== 1) {
        console.log('No hay correos filtrados, volviendo a la página 1');
        setCurrentPage(1);
      }
    }
  }, [filteredEmails.length, displayLimit]); // Eliminamos currentPage de las dependencias

  // Función para cerrar el modal de progreso
  const handleCloseSyncProgress = () => {
    setShowSyncProgress(false);
    // No detenemos el monitoreo, solo ocultamos el modal
  };
  
  // Función para detener el monitoreo
  const stopSyncMonitoring = useCallback(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
  }, []);
  
  // Efecto para limpiar el intervalo al desmontar el componente
  useEffect(() => {
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, []);

  // Añadir un efecto para cargar la información de sincronización al montar el componente
  useEffect(() => {
    async function loadSyncInfo() {
      try {
        const response = await fetch('/api/emails/sync-info');
        if (response.ok) {
          const data = await response.json();
          
          // Actualizar la fecha de última sincronización si está disponible
          if (data.lastUpdated) {
            setLastUpdated(new Date(data.lastUpdated));
          }
        }
      } catch (error) {
        console.error('Error al cargar información de sincronización:', error);
      }
    }
    
    // Cargar la información al iniciar
    loadSyncInfo();
  }, []);

  return (
    <div className="container mx-auto py-6">
      {/* Elemento oculto para rastrear el estado de refreshing */}
      <div id="refreshing-indicator" data-refreshing={isRefreshing.toString()} style={{ display: 'none' }}></div>
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gestión de Correos</h1>
        <div className="flex flex-col items-end">
          <Button onClick={handleRefresh} disabled={isRefreshing || syncIntervalRef.current !== null} className="mb-1">
            {isRefreshing || syncIntervalRef.current !== null ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Actualizando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar
              </>
            )}
          </Button>
          {lastUpdated ? (
            <span className="text-xs text-gray-500">
              Última sincronización: {formattedLastUpdated}
            </span>
          ) : (
            <span className="text-xs text-gray-500">
              No hay información de sincronización disponible
            </span>
          )}
        </div>
      </div>

      <EmailStats stats={stats} />

      <Card className="mt-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Bandeja de Entrada</CardTitle>
              <CardDescription>
                Gestiona tus correos según su estado y prioridad
              </CardDescription>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-gray-500 mt-1">
                {filteredEmails.length > 0 ? (
                  <>
                    {(currentPage - 1) * displayLimit + 1} - {Math.min(currentPage * displayLimit, filteredEmails.length)} de {filteredEmails.length}
                  </>
                ) : (
                  <>0 correos en esta categoría</>
                )}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <div className="bg-background p-4 border-b">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por asunto o remitente"
                      className="pl-8"
                      value={searchQuery}
                      onChange={handleSearchChange}
                    />
                  </div>
                </div>
                
                <div className="flex flex-col items-end sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                  
                  <div className="flex items-center space-x-2">
                    <Select
                      value={displayLimit.toString()}
                      onValueChange={handleDisplayLimitChange}
                    >
                      <SelectTrigger className="w-[150px] h-8">
                        <SelectValue placeholder="Mostrar" />
                      </SelectTrigger>
                      <SelectContent>
                        {displayOptions.map((option) => (
                          <SelectItem key={option} value={option.toString()}>
                            {option} por página
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                  </div>
                  
                  {totalPages > 1 && (
                    <Pagination className="sm:ml-2">
                      <PaginationContent>
                        {currentPage > 1 && (
                          <PaginationItem>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8" 
                              onClick={() => handlePageChange(currentPage - 1)}
                            >
                              <ChevronLeft className="h-4 w-4" />
                              <span className="sr-only">Anterior</span>
                            </Button>
                          </PaginationItem>
                        )}
                        
                        {generatePaginationItems.map((page, idx) => {
                          if (typeof page === 'string') {
                            return (
                              <PaginationItem key={`ellipsis-${idx}`}>
                                <PaginationEllipsis />
                              </PaginationItem>
                            );
                          }
                          
                          return (
                            <PaginationItem key={`page-${page}`}>
                              <PaginationLink 
                                href="#" 
                                isActive={currentPage === page}
                                onClick={(e) => {
                                  e.preventDefault();
                                  handlePageChange(page);
                                }}
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        
                        {currentPage < totalPages && (
                          <PaginationItem>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8" 
                              onClick={() => handlePageChange(currentPage + 1)}
                            >
                              <ChevronRight className="h-4 w-4" />
                              <span className="sr-only">Siguiente</span>
                            </Button>
                          </PaginationItem>
                        )}
                      </PaginationContent>
                    </Pagination>
                  )}
                </div>
              </div>
            </div>

            <Tabs defaultValue="necesitaAtencion" onValueChange={setActiveTab} value={activeTab}>
              <div className="px-4">
                <TabsList className="grid w-full grid-cols-3 mt-2">
                  <TabsTrigger value="necesitaAtencion" className="data-[state=active]:bg-red-50 data-[state=active]:text-red-700">
                    Necesitan Atención
                    {stats.necesitaAtencion > 0 && (
                      <Badge className="ml-2 bg-red-100 text-red-700 border-red-200">
                        {stats.necesitaAtencion}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="informativo" className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                    Informativos
                    {stats.informativo > 0 && (
                      <Badge className="ml-2 bg-blue-100 text-blue-700 border-blue-200">
                        {stats.informativo}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="respondido" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
                    Respondidos
                    {stats.respondido > 0 && (
                      <Badge className="ml-2 bg-green-100 text-green-700 border-green-200">
                        {stats.respondido}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Contenido de las pestañas */}
              <TabsContent value="necesitaAtencion" className="p-4 pt-6">
                {isLoading ? (
                  <TableSkeleton rows={8} />
                ) : (
                  <EmailList
                    emails={emailsToDisplay}
                    onOpenEmail={handleOpenEmail}
                    onMarkAsInformative={handleMarkAsInformative}
                    onMarkAsResponded={handleMarkAsResponded}
                    sortOrder={getListSortOrder()}
                    onChangeSortOrder={handleSortChange}
                    emptyMessage={searchQuery ? "No hay correos que coincidan con la búsqueda" : "No hay correos que requieran atención"}
                  />
                )}
              </TabsContent>
              
              <TabsContent value="informativo" className="p-4 pt-6">
                {isLoading ? (
                  <TableSkeleton rows={8} />
                ) : (
                  <EmailList
                    emails={emailsToDisplay}
                    onOpenEmail={handleOpenEmail}
                    onMarkAsResponded={handleMarkAsResponded}
                    onUpdateStatus={handleUpdateStatus}
                    sortOrder={getListSortOrder()}
                    onChangeSortOrder={handleSortChange}
                    emptyMessage={searchQuery ? "No hay correos que coincidan con la búsqueda" : "No hay correos informativos"}
                  />
                )}
              </TabsContent>
              
              <TabsContent value="respondido" className="p-4 pt-6">
                {isLoading ? (
                  <TableSkeleton rows={8} />
                ) : (
                  <EmailList
                    emails={emailsToDisplay}
                    onOpenEmail={handleOpenEmail}
                    onMarkAsInformative={handleMarkAsInformative}
                    onUpdateStatus={handleUpdateStatus}
                    sortOrder={getListSortOrder()}
                    onChangeSortOrder={handleSortChange}
                    emptyMessage={searchQuery ? "No hay correos que coincidan con la búsqueda" : "No hay correos respondidos"}
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {selectedEmail && (
        <EmailModal 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)} 
          email={selectedEmail}
          onUpdateStatus={handleUpdateStatus}
        />
      )}

      <SyncProgressModal
        isOpen={showSyncProgress}
        onClose={handleCloseSyncProgress}
        status={syncStatus}
        lastLog={syncLastLog}
      />
    </div>
  );
} 