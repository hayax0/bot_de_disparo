"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/store/useAuth';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/lib/api';
import axios from 'axios';
import {
  LogOut,
  Smartphone,
  Play,
  Pause,
  Trash2,
  Plus,
  QrCode,
  HelpCircle,
  FileJson,
  ExternalLink,
  CheckCircle2,
  ShieldCheck,
  Clock,
  BookOpen,
  Info,
  X,
  Menu,
  Eye,
  Search,
  AlertTriangle,
  RefreshCw,
  Globe,
  MapPin,
  Check,
  CheckCheck,
  AlertCircle,
  Users,
  Zap,
  Layers,
  Activity,
  Crown,
  CreditCard,
  Copy,
  History,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Lock,
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit2,
  Sparkles,
  FileCheck
} from 'lucide-react';
import { CAKTO_CHECKOUT_URL, OFFICIAL_PLAN } from '@/lib/constants';

interface Campaign {
  id: string;
  name: string;
  status: string;
  messageComSite?: string | null;
  messageSemSite?: string | null;
  delayMin: number;
  delayMax: number;
  scheduleStartMinute?: number;
  scheduleEndMinute?: number;
  scheduleDays?: string;
  scheduleTimezone?: string;
  recontactAfterDays?: number;
  createdAt: string;
  _count?: {
    leads: number;
  };
  stats?: CampaignStats;
}

interface Lead {
  id: string;
  title: string;
  phone: string;
  website?: string | null;
  neighborhood?: string | null;
  status: 'PENDING' | 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'REPLIED' | 'ERROR' | 'IGNORED';
  errorMessage?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  wppMessageId?: string | null;
  historyInfo?: {
    alreadySent: boolean;
    lastSentAt: string | null;
    sendCount: number;
    lastCampaignName: string | null;
  };
}

interface DispatchHistoryItem {
  id: string;
  companyTitle: string;
  phone: string;
  website?: string | null;
  neighborhood?: string | null;
  firstSentAt: string;
  lastSentAt: string;
  lastMessage?: string | null;
  lastCampaignName?: string | null;
  sendCount: number;
}

interface HistoryStats {
  totalCompanies: number;
  totalDispatches: number;
}

interface CampaignDetails {
  campaign: Campaign;
  leads: Lead[];
  counts: {
    total: number;
    pending: number;
    queued?: number;
    sending?: number;
    sent: number;
    delivered?: number;
    read?: number;
    replied: number;
    error: number;
    ignored?: number;
    optedOut?: number;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface CampaignStats {
  total: number;
  pending: number;
  queued: number;
  sending?: number;
  sent: number;
  delivered?: number;
  read?: number;
  replied: number;
  error: number;
  ignored?: number;
  optedOut?: number;
  progress: number;
  estimatedSecondsRemaining: number | null;
  scheduleStatus?: {
    isInWindow: boolean;
    nextOpenTimestamp?: number | null;
    delayMs?: number | null;
    reason?: string | null;
  } | null;
}

interface QueueHealth {
  queue: {
    campaignPendingJobs: number;
    orphanedLeads: number;
  };
  globalQueue: {
    waiting: number;
    delayed: number;
    active: number;
    failed: number;
  };
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

// Formata segundos em "Xh Ym" legível
function formatEta(seconds: number): string {
  if (seconds < 60) return '<1min';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `~${m}min`;
  return `~${h}h ${m}min`;
}

// Formata data e hora da próxima abertura no fuso de São Paulo
function formatNextOpen(timestamp: number): string {
  const target = new Date(timestamp);
  const now = new Date();
  
  const targetDayStr = target.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const nowDayStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDayStr = tomorrow.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const timeStr = target.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

  if (targetDayStr === nowDayStr) return `hoje às ${timeStr}`;
  if (targetDayStr === tomorrowDayStr) return `amanhã às ${timeStr}`;
  const dayName = target.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
  return `na ${dayName} às ${timeStr}`;
}

// Formata telefone brasileiro para exibição amigável
function formatPhone(phone: string): string {
  if (!phone) return '—';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    if (num.length === 9) {
      return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
    }
    return `+55 (${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export default function Dashboard() {
  const { token, user, isHydrated, hydrate, logout } = useAuth();
  const router = useRouter();
  const [clientTime, setClientTime] = useState<number | null>(null);

  useEffect(() => {
    const initialUpdate = setTimeout(() => {
      setClientTime(Date.now());
    }, 0);
    const interval = setInterval(() => {
      setClientTime(Date.now());
    }, 30000);
    return () => {
      clearTimeout(initialUpdate);
      clearInterval(interval);
    };
  }, []);
  
  const [waStatus, setWaStatus] = useState<{ status: string; qrCode?: string | null } | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, CampaignStats>>({});
  const [queueHealth, setQueueHealth] = useState<QueueHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Ações com feedback de carregamento (evita duplo clique)
  const [connecting, setConnecting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Inicializar hidratação segura do Zustand client-side
  useEffect(() => {
    hydrate();
  }, [hydrate]);
  
  // Abas do Dashboard
  const [activeTab, setActiveTab] = useState<'campaigns' | 'history'>('campaigns');

  // Histórico Permanente de Disparos por Workspace
  const [historyItems, setHistoryItems] = useState<DispatchHistoryItem[]>([]);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [historyStats, setHistoryStats] = useState<HistoryStats>({ totalCompanies: 0, totalDispatches: 0 });
  const [historySearch, setHistorySearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistoryMessage, setSelectedHistoryMessage] = useState<DispatchHistoryItem | null>(null);

  // Persistência da última copy utilizada
  const [lastUsedCopy, setLastUsedCopy] = useState<{ messageComSite: string | null; messageSemSite: string | null } | null>(null);

  // Modais e Drawers
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignDetails, setCampaignDetails] = useState<CampaignDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [leadFilterStatus, setLeadFilterStatus] = useState<string>('ALL');
  const [leadSearchTerm, setLeadSearchTerm] = useState('');
  const [debouncedLeadSearchTerm, setDebouncedLeadSearchTerm] = useState('');

  // Estados de Prévia de Importação de Leads
  const [importPreview, setImportPreview] = useState<{
    loading: boolean;
    error: string | null;
    diagnostic: {
      totalRows: number;
      validCount: number;
      duplicateCount: number;
      invalidCount: number;
      recontactBlockedCount: number;
      alreadyContactedCount: number;
      sampleLeads: Array<{
        rowNumber: number;
        title: string;
        phone: string;
        website: string | null;
        neighborhood: string | null;
        status: string;
        alreadyContacted: boolean;
        reason?: string | null;
      }>;
      issues: Array<{
        row: number;
        title?: string;
        phone?: string;
        type: string;
        reason: string;
      }>;
    } | null;
  }>({ loading: false, error: null, diagnostic: null });

  // Estados do Simulador de Mensagem (WhatsApp Web)
  const [messagePreviewTab, setMessagePreviewTab] = useState<'semSite' | 'comSite'>('semSite');
  const [messagePreviewLoading, setMessagePreviewLoading] = useState(false);
  const [messagePreviewData, setMessagePreviewData] = useState<{
    valid: boolean;
    warnings: string[];
    notice: string;
    previews: {
      comSite: { rendered: string; lead: { title?: string; neighborhood?: string; website?: string | null }; warnings: string[] };
      semSite: { rendered: string; lead: { title?: string; neighborhood?: string; website?: string | null }; warnings: string[] };
    };
  } | null>(null);
  const [spintaxSeed, setSpintaxSeed] = useState(0);

  // Estado de Rascunho Restaurado
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const isFetchingCampaignsRef = useRef(false);

  // Sincronização, concorrência e proteção de race condition no modal de detalhes
  const selectedCampaignIdRef = useRef<string | null>(null);
  const isPollingDetailsRef = useRef(false);
  const detailsRequestIdRef = useRef(0);
  const [detailsLastSyncTime, setDetailsLastSyncTime] = useState<number | null>(null);
  const [detailsSyncError, setDetailsSyncError] = useState<string | null>(null);
  const [detailsSyncWarning, setDetailsSyncWarning] = useState<string | null>(null);
  const LEADS_PER_PAGE = 25;
  const [leadPage, setLeadPage] = useState(1);

  // Workspace / Empresa ({minhaEmpresa})
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState('');
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  
  // Modal de Confirmação de Exclusão
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);

  // Mobile sidebar
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Pareamento por código (alternativa à câmera)
  const [pairingMode, setPairingMode] = useState<'qr' | 'code'>('qr');
  const [pairingPhone, setPairingPhone] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [isPairingLoading, setIsPairingLoading] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  // Estado e verificação ativa de assinatura (Paywall Oficial)
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [verifyPaymentFeedback, setVerifyPaymentFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [verificationRequiredMessage, setVerificationRequiredMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleVerificationRequired = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string }>;
      setVerificationRequiredMessage(customEvent.detail?.message || 'E-mail não verificado. Conclua a regularização da sua conta.');
    };
    window.addEventListener('auth:verification_required', handleVerificationRequired);
    return () => window.removeEventListener('auth:verification_required', handleVerificationRequired);
  }, []);

  const isSubscriptionActive = useMemo(() => {
    if (!user) return false;
    if (user.role === 'ADMIN' || user.subscriptionStatus === 'LIFETIME') return true;
    if (user.subscriptionStatus === 'ACTIVE' || user.subscriptionStatus === 'CANCELED') {
      if (!user.subscriptionExpiresAt) return false;
      if (clientTime === null) return user.subscriptionStatus === 'ACTIVE';
      return new Date(user.subscriptionExpiresAt).getTime() > clientTime;
    }
    return false;
  }, [user, clientTime]);

  const handleVerifyPayment = async () => {
    setVerifyingPayment(true);
    setVerifyPaymentFeedback(null);
    try {
      const res = await api.post('/auth/verify-payment');
      if (res.data?.active) {
        setVerifyPaymentFeedback({
          type: 'success',
          message: 'Pagamento confirmado com sucesso! Seu acesso está liberado.'
        });
        const updatedUser = { ...user, ...res.data.user };
        useAuth.getState().setAuth(token, updatedUser);
        addToast('success', 'Assinatura ativa confirmada!');
      } else {
        setVerifyPaymentFeedback({
          type: 'info',
          message: 'Pagamento ainda não confirmado. Se você acabou de pagar, aguarde alguns instantes e tente novamente.'
        });
      }
    } catch (err: unknown) {
      let msg = 'Erro ao verificar pagamento no servidor.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      setVerifyPaymentFeedback({
        type: 'error',
        message: msg
      });
    } finally {
      setVerifyingPayment(false);
    }
  };

  // Carregar status do WhatsApp
  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/whatsapp/status');
      setWaStatus(res.data);
    } catch {
      // Polling silencioso
    }
  }, []);

  // Carregar histórico de disparos do Workspace
  const historyRequest = useRef(0);
  const fetchHistory = useCallback(async (page = 1, search = '') => {
    const requestId = ++historyRequest.current;
    setHistoryLoading(true);
    try {
      const res = await api.get('/history', {
        params: { page, limit: 25, search: search.trim() }
      });
      if (requestId !== historyRequest.current) return;
      setHistoryItems(res.data.items || []);
      setHistoryPagination(res.data.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 });
      if (res.data.stats) {
        setHistoryStats(res.data.stats);
      }
    } catch (err: unknown) {
      if (requestId !== historyRequest.current) return;
      let msg = 'Erro ao carregar histórico de disparos.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      if (requestId === historyRequest.current) setHistoryLoading(false);
    }
  }, [addToast]);

  // Carregar última copy utilizada no Workspace
  const fetchLastCopy = useCallback(async () => {
    try {
      const res = await api.get('/campaigns/last-copy');
      if (res.data) {
        setLastUsedCopy(res.data);
      }
    } catch (err) {
      console.warn('Falha ao carregar última copy:', err);
    }
  }, []);

  // Carregar dados da empresa/workspace
  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await api.get('/auth/workspace');
      if (res.data?.workspace?.name) {
        setWorkspaceName(res.data.workspace.name);
      }
    } catch (err) {
      console.warn('Falha ao carregar workspace:', err);
    }
  }, []);

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = editingWorkspaceName.trim();
    if (clean.length < 2 || clean.length > 100) {
      addToast('error', 'O nome da empresa deve ter entre 2 e 100 caracteres.');
      return;
    }
    setSavingWorkspace(true);
    try {
      const res = await api.patch('/auth/workspace', { name: clean });
      const updated = res.data.workspace.name;
      setWorkspaceName(updated);
      if (user) {
        useAuth.getState().setAuth(token, {
          ...user,
          workspace: { id: res.data.workspace.id, name: updated }
        });
      }
      addToast('success', 'Nome da empresa salvo com sucesso! As próximas mensagens usarão esse nome na variável {minhaEmpresa}.');
      setIsWorkspaceModalOpen(false);
    } catch (err: unknown) {
      let msg = 'Erro ao atualizar dados da empresa.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setSavingWorkspace(false);
    }
  };

  // Carregar campanhas + métricas reais calculadas em lote direto no backend
  const fetchCampaigns = useCallback(async () => {
    if (isFetchingCampaignsRef.current) return;
    isFetchingCampaignsRef.current = true;
    try {
      const res = await api.get('/campaigns');
      const camps: Campaign[] = res.data;
      setCampaigns(camps);

      // Backend já entrega as stats calculadas em lote para cada campanha
      const map: Record<string, CampaignStats> = {};
      camps.forEach(c => {
        if (c.stats) {
          map[c.id] = c.stats;
        }
      });
      setStatsMap(prev => ({ ...prev, ...map }));
      setLastSyncTime(Date.now());
      setSyncError(null);
    } catch (err: unknown) {
      let msg = 'Erro ao sincronizar campanhas.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      setSyncError(msg);
    } finally {
      isFetchingCampaignsRef.current = false;
      setIsLoading(false);
    }
  }, []);

  // Carga inicial completa
  useEffect(() => {
    if (!isHydrated) return;
    if (!token) {
      router.push('/login');
      return;
    }
    let isMounted = true;
    const loadData = async () => {
      if (isMounted) {
        await Promise.all([
          fetchStatus(),
          fetchCampaigns(),
          fetchHistory(1, ''),
          fetchLastCopy(),
          fetchWorkspace()
        ]);
      }
    };
    loadData();

    return () => {
      isMounted = false;
    };
  }, [isHydrated, token, fetchStatus, fetchCampaigns, fetchHistory, fetchLastCopy, fetchWorkspace, router]);

  // Polling adaptativo contínuo de campanhas: 5s se houver campanha RUNNING ou STARTING, 20s em repouso
  // Pausa com aba oculta e atualiza imediatamente ao voltar
  useEffect(() => {
    if (!isHydrated || !token) return;

    const hasActiveCampaign = campaigns.some(
      c => c.status === 'RUNNING' || c.status === 'STARTING'
    );
    const intervalMs = hasActiveCampaign ? 5000 : 20000;

    const tick = () => {
      if (document.visibilityState === 'visible') {
        fetchCampaigns();
      }
    };

    const intervalId = setInterval(tick, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCampaigns();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isHydrated, token, campaigns, fetchCampaigns]);

  // Polling contínuo e responsivo exclusivo do WhatsApp:
  // 2.5s durante conexão, exibição de QR Code, pareamento por código ou inicialização
  // 15s em repouso estável (conectado ou desconectado)
  useEffect(() => {
    if (!isHydrated || !token) return;

    const isTransitional = 
      connecting || 
      isPairingLoading || 
      pairingCode !== null || 
      waStatus?.status === 'QRCODE' || 
      waStatus?.status === 'INITIALIZING';

    const intervalMs = isTransitional ? 2500 : 15000;

    const tick = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    };

    const intervalId = setInterval(tick, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isHydrated, token, connecting, isPairingLoading, pairingCode, waStatus?.status, fetchStatus]);

  // Debounce na busca de leads do modal de detalhes (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedLeadSearchTerm(leadSearchTerm);
    }, 350);
    return () => clearTimeout(timer);
  }, [leadSearchTerm]);

  // Função centralizada para carregar leads paginados do servidor
  const fetchLeadsForCampaign = useCallback(async (campaignId: string, page = 1, status = 'ALL', search = '') => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LEADS_PER_PAGE));
    if (status && status !== 'ALL') params.set('status', status);
    if (search && search.trim() !== '') params.set('search', search.trim());
    return api.get(`/campaigns/${campaignId}/leads?${params.toString()}`);
  }, [LEADS_PER_PAGE]);

  // Efeito para recarregar leads quando o usuário troca de página, status ou busca
  useEffect(() => {
    if (!selectedCampaignId) return;
    let isCurrent = true;
    const reqId = ++detailsRequestIdRef.current;

    fetchLeadsForCampaign(selectedCampaignId, leadPage, leadFilterStatus, debouncedLeadSearchTerm)
      .then(res => {
        if (!isCurrent || selectedCampaignIdRef.current !== selectedCampaignId || detailsRequestIdRef.current !== reqId) return;
        setCampaignDetails(res.data);
        setDetailsLastSyncTime(Date.now());
        setDetailsSyncError(null);
      })
      .catch(() => {
        if (!isCurrent || selectedCampaignIdRef.current !== selectedCampaignId || detailsRequestIdRef.current !== reqId) return;
        setDetailsSyncError('Falha ao atualizar leads.');
      })
      .finally(() => {
        if (isCurrent && selectedCampaignIdRef.current === selectedCampaignId) {
          setIsLoadingDetails(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedCampaignId, leadPage, leadFilterStatus, debouncedLeadSearchTerm, fetchLeadsForCampaign]);

  // Polling de detalhes sincronizados (contadores + leads juntos) com proteção de sobreposição e race conditions
  useEffect(() => {
    if (!selectedCampaignId) {
      selectedCampaignIdRef.current = null;
      isPollingDetailsRef.current = false;
      return;
    }
    selectedCampaignIdRef.current = selectedCampaignId;
    const currentId = selectedCampaignId;

    const pollDetails = async () => {
      if (document.visibilityState !== 'visible') return;
      // Previne requisições simultâneas concorrentes caso a anterior ainda esteja em voo
      if (isPollingDetailsRef.current) return;
      isPollingDetailsRef.current = true;
      ++detailsRequestIdRef.current;

      try {
        const [leadsRes, statsRes, healthRes] = await Promise.allSettled([
          fetchLeadsForCampaign(currentId, leadPage, leadFilterStatus, debouncedLeadSearchTerm),
          api.get(`/campaigns/${currentId}/stats`),
          api.get(`/campaigns/${currentId}/queue-health`)
        ]);

        // Descarta respostas se o usuário fechou o modal ou trocou de campanha
        if (selectedCampaignIdRef.current !== currentId) return;

        let partialIssue = false;

        if (leadsRes.status === 'fulfilled') {
          setCampaignDetails(leadsRes.value.data);
          setDetailsLastSyncTime(Date.now());
          setDetailsSyncError(null);
          setIsLoadingDetails(false);
        } else {
          setDetailsSyncError('Não foi possível atualizar a lista de leads.');
        }

        if (statsRes.status === 'fulfilled') {
          setStatsMap(prev => ({ ...prev, [currentId]: statsRes.value.data }));
        } else {
          partialIssue = true;
        }

        if (healthRes.status === 'fulfilled') {
          setQueueHealth(healthRes.value.data);
        } else {
          partialIssue = true;
        }

        if (leadsRes.status === 'fulfilled' && partialIssue) {
          setDetailsSyncWarning('Estatísticas ou saúde da fila temporariamente pendentes');
        } else if (leadsRes.status === 'fulfilled') {
          setDetailsSyncWarning(null);
        }
      } catch {
        if (selectedCampaignIdRef.current === currentId) {
          setDetailsSyncError('Falha ao atualizar dados em tempo real.');
        }
      } finally {
        isPollingDetailsRef.current = false;
      }
    };

    const interval = setInterval(pollDetails, 6000);
    return () => {
      clearInterval(interval);
      isPollingDetailsRef.current = false;
    };
  }, [selectedCampaignId, leadPage, leadFilterStatus, debouncedLeadSearchTerm, fetchLeadsForCampaign]);

  // Tecla ESC para fechar modais
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setIsTutorialOpen(false);
        setSelectedCampaignId(null);
        selectedCampaignIdRef.current = null;
        setQueueHealth(null);
        setCampaignDetails(null);
        setIsLoadingDetails(false);
        setCampaignToDelete(null);
        setIsMobileMenuOpen(false);
        setSelectedHistoryMessage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      await api.post('/whatsapp/connect');
      addToast('info', 'Inicializando conexão com o WhatsApp...');
      fetchStatus();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && (err.response?.status === 403 || err.response?.data?.code === 'SUBSCRIPTION_REQUIRED')) {
        setIsSubscriptionModalOpen(true);
      }
      let msg = 'Erro ao conectar WhatsApp.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      await api.post('/whatsapp/disconnect');
      addToast('info', 'WhatsApp desconectado com sucesso.');
      fetchStatus();
    } catch (err: unknown) {
      let msg = 'Erro ao desconectar.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pairingPhone.replace(/\D/g, '');
    if (clean.length < 10) {
      addToast('error', 'Digite o DDD + número de telefone válido (ex: 11999998888).');
      return;
    }
    setIsPairingLoading(true);
    try {
      const res = await api.post('/whatsapp/pairing-code', { phone: clean });
      setPairingCode(res.data.code);
      addToast('success', 'Código gerado! Digite no seu WhatsApp em Aparelhos Conectados.');
    } catch (err: unknown) {
      let msg = 'Erro ao gerar código de pareamento.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setIsPairingLoading(false);
    }
  };

  // Carregar detalhes dos leads da campanha com proteção contra race conditions e respostas fora de ordem
  const openCampaignDetails = useCallback(async (campaignId: string) => {
    selectedCampaignIdRef.current = campaignId;
    setQueueHealth(null);
    setCampaignDetails(null);
    setSelectedCampaignId(campaignId);
    setIsLoadingDetails(true);
    setDetailsSyncError(null);
    setDetailsSyncWarning(null);
    setLeadPage(1);
    setLeadFilterStatus('ALL');
    setLeadSearchTerm('');
    try {
      const [leadsRes, statsRes, healthRes] = await Promise.allSettled([
        fetchLeadsForCampaign(campaignId, 1, 'ALL', ''),
        api.get(`/campaigns/${campaignId}/stats`),
        api.get(`/campaigns/${campaignId}/queue-health`)
      ]);

      if (selectedCampaignIdRef.current !== campaignId) return;

      let partialIssue = false;

      if (leadsRes.status === 'fulfilled') {
        setCampaignDetails(leadsRes.value.data);
        const syncNow = new Date().getTime();
        setDetailsLastSyncTime(syncNow);
        setDetailsSyncError(null);
      } else {
        throw new Error('Falha ao carregar leads');
      }

      if (statsRes.status === 'fulfilled') {
        setStatsMap(prev => ({ ...prev, [campaignId]: statsRes.value.data }));
      } else {
        partialIssue = true;
      }

      if (healthRes.status === 'fulfilled') {
        setQueueHealth(healthRes.value.data);
      } else {
        partialIssue = true;
      }

      if (leadsRes.status === 'fulfilled' && partialIssue) {
        setDetailsSyncWarning('Estatísticas ou saúde da fila temporariamente pendentes');
      } else if (leadsRes.status === 'fulfilled') {
        setDetailsSyncWarning(null);
      }
    } catch (err: unknown) {
      if (selectedCampaignIdRef.current !== campaignId) return;
      let msg = 'Erro ao carregar detalhes dos leads.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
      setSelectedCampaignId(null);
      setQueueHealth(null);
    } finally {
      if (selectedCampaignIdRef.current === campaignId) {
        setIsLoadingDetails(false);
      }
    }
  }, [addToast, fetchLeadsForCampaign]);

  const closeCampaignDetails = useCallback(() => {
    selectedCampaignIdRef.current = null;
    setSelectedCampaignId(null);
    setQueueHealth(null);
    setCampaignDetails(null);
    setIsLoadingDetails(false);
    setDetailsSyncError(null);
    setDetailsSyncWarning(null);
  }, []);

  const defaultComSite = "{Fala|Olá|Oi}, {nome}! {Tudo bem|Tudo certo}?\n\n{meuNome} por aqui. Estava analisando a estrutura de vocês e vi que vocês já possuem um site ativo ({website}). Mas me diz uma coisa: quanto tempo a sua equipe perde na semana respondendo mensagem de curioso no WhatsApp que só quer saber preço e não tem perfil pra fechar?\n\nA gente implementou uma camada de triagem automática que roda no próprio site de vocês, educa o cliente, filtra o orçamento e só joga pro seu WhatsApp quem tá pronto pra fechar contrato.\n\nFaria sentido eu te mandar um áudio de 45 segundos mostrando como aplicar isso na {nome}?";
  const defaultSemSite = "{Fala|Olá|Oi}, {nome}! {Tudo bem|Tudo certo}?\n\n{meuNome} por aqui. Estava dando uma olhada na presença de vocês em {bairro} e vi que vocês ainda não têm um site próprio no ar. Como o cliente de maior ticket sempre pesquisa a credibilidade da empresa no Google antes de fechar, eu montei uma demonstração prática de como ficaria a página da {nome} no ar com filtro de clientes automático.\n\nFaria sentido eu te mandar o link desse protótipo pra você dar uma olhada em 1 minuto?";
  const defaultB2B = "{Fala|Olá|Oi}, {nome}! {Tudo bem|Como vai}?\n\nVi a atuação de vocês em {bairro} e achei muito interessante o trabalho da {nome}. Nós ajudamos empresas do seu segmento a aumentarem o volume de contatos qualificados todos os meses através da internet.\n\nVocê teria 2 minutinhos essa semana para batermos um papo rápido e eu te apresentar uma ideia simples que pode gerar mais clientes para a {nome}?";

  const [newCampaign, setNewCampaign] = useState({ 
    name: '', 
    messageComSite: '', 
    messageSemSite: '', 
    file: null as File | null, 
    delayMin: 90, 
    delayMax: 180,
    scheduleStartMinute: 480, // 08:00
    scheduleEndMinute: 1200,  // 20:00
    scheduleDays: '1,2,3,4,5', // Seg a Sex
    scheduleTimezone: 'America/Sao_Paulo',
    recontactAfterDays: 30
  });
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Isolamento do rascunho por usuário e workspace com versionamento seguro
  const draftStorageKey = useMemo(() => {
    return `bot_disparo_draft_v1_${user?.id || 'anon'}_${user?.workspaceId || 'default'}`;
  }, [user?.id, user?.workspaceId]);

  const saveDraftTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const draftDataRef = useRef(newCampaign);
  useEffect(() => {
    draftDataRef.current = newCampaign;
  }, [newCampaign]);

  const saveDraftNow = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const data = draftDataRef.current;
      if (data.name.trim() || data.messageComSite.trim() || data.messageSemSite.trim()) {
        const payload = {
          version: 1,
          savedAt: Date.now(),
          data: {
            name: data.name,
            messageComSite: data.messageComSite,
            messageSemSite: data.messageSemSite,
            delayMin: data.delayMin,
            delayMax: data.delayMax,
            scheduleStartMinute: data.scheduleStartMinute,
            scheduleEndMinute: data.scheduleEndMinute,
            scheduleDays: data.scheduleDays,
            scheduleTimezone: data.scheduleTimezone,
            recontactAfterDays: data.recontactAfterDays
          }
        };
        localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      }
    } catch {
      // Falha silenciosa caso localStorage esteja bloqueado
    }
  }, [draftStorageKey]);

  const clearDraft = useCallback(() => {
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
      saveDraftTimeoutRef.current = null;
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {}
    }
    setHasRestoredDraft(false);
  }, [draftStorageKey]);

  // Debounce de 600ms no rascunho enquanto o usuário digita
  useEffect(() => {
    if (!isModalOpen) return;
    if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current);
    saveDraftTimeoutRef.current = setTimeout(() => {
      saveDraftNow();
    }, 600);
    return () => {
      if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current);
    };
  }, [newCampaign, isModalOpen, saveDraftNow]);

  // Salvamento garantido em beforeunload e visibilitychange (resistente a F5 e fechamento de aba)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isModalOpen) saveDraftNow();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isModalOpen) {
        saveDraftNow();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isModalOpen, saveDraftNow]);

  // Abrir modal de Nova Campanha recuperando rascunho se disponível
  const openNewCampaignModal = () => {
    let loadedFromDraft = false;
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(draftStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.version === 1 && parsed.data) {
            setNewCampaign(prev => ({
              ...prev,
              ...parsed.data,
              file: null
            }));
            setHasRestoredDraft(true);
            loadedFromDraft = true;
          }
        }
      } catch {}
    }

    if (!loadedFromDraft) {
      setNewCampaign(prev => ({
        ...prev,
        messageComSite: prev.messageComSite || lastUsedCopy?.messageComSite || '',
        messageSemSite: prev.messageSemSite || lastUsedCopy?.messageSemSite || ''
      }));
      setHasRestoredDraft(false);
    }

    setIsModalOpen(true);
  };

  // Disparo de Prévia da Importação de Leads com recontato sincronizado
  const handleFileChange = async (file: File | null, recontactDays = newCampaign.recontactAfterDays) => {
    setNewCampaign(prev => ({ ...prev, file }));
    if (!file) {
      setImportPreview({ loading: false, error: null, diagnostic: null });
      return;
    }

    setImportPreview({ loading: true, error: null, diagnostic: null });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('recontactAfterDays', String(recontactDays));

    try {
      const res = await api.post('/campaigns/preview-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportPreview({ loading: false, error: null, diagnostic: res.data });
    } catch (err: unknown) {
      let msg = 'Erro ao processar prévia do arquivo de leads.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      setImportPreview({ loading: false, error: msg, diagnostic: null });
    }
  };

  // Prévia da Mensagem (WhatsApp Simulator) com debounce e sorteio de Spintax
  useEffect(() => {
    if (!isModalOpen) return;
    const timer = setTimeout(async () => {
      setMessagePreviewLoading(true);
      try {
        const sampleLead = importPreview.diagnostic?.sampleLeads?.[0] || undefined;
        const res = await api.post('/campaigns/preview-message', {
          messageComSite: newCampaign.messageComSite,
          messageSemSite: newCampaign.messageSemSite,
          sampleLead
        });
        setMessagePreviewData(res.data);
      } catch {
        // silencioso
      } finally {
        setMessagePreviewLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [newCampaign.messageComSite, newCampaign.messageSemSite, isModalOpen, spintaxSeed, importPreview.diagnostic]);

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaign.file) {
      addToast('error', 'Por favor, anexe o arquivo de leads (.json ou .csv).');
      return;
    }
    if (importPreview.diagnostic && importPreview.diagnostic.validCount === 0) {
      addToast('error', 'Nenhum lead apto para disparo neste arquivo. Corrija os contatos antes de prosseguir.');
      return;
    }
    if (!newCampaign.messageSemSite.trim() && !newCampaign.messageComSite.trim()) {
      addToast('error', 'Por favor, escreva ao menos uma mensagem para a campanha (sem site, com site ou ambas).');
      return;
    }

    // Validações de agendamento
    if (!newCampaign.scheduleDays || newCampaign.scheduleDays.trim().length === 0) {
      addToast('error', 'Selecione pelo menos um dia da semana para os disparos.');
      return;
    }
    if (newCampaign.scheduleEndMinute <= newCampaign.scheduleStartMinute) {
      addToast('error', 'O horário de término dos envios deve ser posterior ao horário de início.');
      return;
    }

    setIsSubmitting(true);
    let createdCampaignId: string | null = null;
    try {
      // 1. Criar campanha com agendamento
      const res = await api.post('/campaigns', {
        name: newCampaign.name,
        messageComSite: newCampaign.messageComSite.trim() || null,
        messageSemSite: newCampaign.messageSemSite.trim() || null,
        delayMin: newCampaign.delayMin,
        delayMax: newCampaign.delayMax,
        scheduleStartMinute: newCampaign.scheduleStartMinute,
        scheduleEndMinute: newCampaign.scheduleEndMinute,
        scheduleDays: newCampaign.scheduleDays,
        scheduleTimezone: newCampaign.scheduleTimezone,
        recontactAfterDays: newCampaign.recontactAfterDays
      });
      createdCampaignId = res.data.id;

      // 2. Upload leads
      const formData = new FormData();
      formData.append('file', newCampaign.file);
      const importRes = await api.post(`/campaigns/${createdCampaignId}/leads/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const alreadySent = importRes.data.alreadySentCount || 0;
      if (alreadySent > 0) {
        addToast('success', `Campanha criada! ${importRes.data.imported} leads importados. Atenção: ${alreadySent} já foram contatados anteriormente.`);
      } else {
        addToast('success', `Campanha criada! ${importRes.data.imported} leads importados (${importRes.data.skipped} ignorados/duplicados).`);
      }

      // Limpeza do rascunho com sucesso
      clearDraft();
      setIsModalOpen(false);
      setNewCampaign({ 
        name: '', 
        messageComSite: '', 
        messageSemSite: '', 
        file: null, 
        delayMin: 90, 
        delayMax: 180,
        scheduleStartMinute: 480,
        scheduleEndMinute: 1200,
        scheduleDays: '1,2,3,4,5',
        scheduleTimezone: 'America/Sao_Paulo',
        recontactAfterDays: 30
      });
      setImportPreview({ loading: false, error: null, diagnostic: null });
      setIsScheduleOpen(false);
      fetchCampaigns();
      fetchHistory(1, historySearch);
      fetchLastCopy();
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && (err.response?.status === 403 || err.response?.data?.code === 'SUBSCRIPTION_REQUIRED')) {
        setIsSubscriptionModalOpen(true);
      }
      // Se a campanha foi criada mas o upload de leads falhou, remove a campanha vazia órfã
      if (createdCampaignId) {
        try {
          await api.delete(`/campaigns/${createdCampaignId}`);
        } catch {
          // limpeza silenciosa
        }
      }
      let msg = 'Erro ao criar campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStart = async (id: string) => {
    if (actionLoading) return;
    setActionLoading(id);
    try {
      const res = await api.post(`/campaigns/${id}/start`);
      addToast('success', res.data.message || 'Campanha iniciada com sucesso!');
      fetchCampaigns();
      if (selectedCampaignId === id) openCampaignDetails(id);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && (err.response?.status === 403 || err.response?.data?.code === 'SUBSCRIPTION_REQUIRED')) {
        setIsSubscriptionModalOpen(true);
      }
      let msg = 'Erro ao iniciar campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (id: string) => {
    if (actionLoading) return;
    setActionLoading(id);
    try {
      await api.post(`/campaigns/${id}/pause`);
      addToast('info', 'Campanha pausada.');
      fetchCampaigns();
      if (selectedCampaignId === id) openCampaignDetails(id);
    } catch (err: unknown) {
      let msg = 'Erro ao pausar campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = async () => {
    if (!campaignToDelete || actionLoading) return;
    setActionLoading(campaignToDelete.id);
    try {
      await api.delete(`/campaigns/${campaignToDelete.id}`);
      addToast('success', 'Campanha excluída com sucesso.');
      setCampaignToDelete(null);
      if (selectedCampaignId === campaignToDelete.id) {
        setSelectedCampaignId(null);
        setQueueHealth(null);
      }
      fetchCampaigns();
      fetchHistory(1, historySearch);
    } catch (err: unknown) {
      let msg = 'Erro ao excluir campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setActionLoading(null);
    }
  };

  // Filtragem de leads na visualização da campanha
  // Paginação dos leads no modal de detalhes (server-side com fallback client-side)
  const totalLeadPages = useMemo(() => {
    if (campaignDetails?.pagination?.totalPages !== undefined) {
      return Math.max(1, campaignDetails.pagination.totalPages);
    }
    return Math.max(1, Math.ceil((campaignDetails?.leads?.length || 0) / LEADS_PER_PAGE));
  }, [campaignDetails, LEADS_PER_PAGE]);

  const currentLeadPage = useMemo(() => {
    return Math.min(leadPage, totalLeadPages);
  }, [leadPage, totalLeadPages]);

  const pagedLeads = useMemo(() => {
    if (!campaignDetails?.leads) return [];
    if (campaignDetails.pagination) {
      return campaignDetails.leads;
    }
    const start = (currentLeadPage - 1) * LEADS_PER_PAGE;
    return campaignDetails.leads.slice(start, start + LEADS_PER_PAGE);
  }, [campaignDetails, currentLeadPage, LEADS_PER_PAGE]);

  const totalFilteredLeadsCount = useMemo(() => {
    if (campaignDetails?.pagination?.total !== undefined) {
      return campaignDetails.pagination.total;
    }
    return campaignDetails?.leads?.length || 0;
  }, [campaignDetails]);

  // Cálculos de métricas globais
  const totalLeadsGlobal = useMemo(() => {
    return campaigns.reduce((acc, c) => acc + (c._count?.leads || 0), 0);
  }, [campaigns]);

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-[#08090D] flex items-center justify-center relative selection:bg-purple-500/30">
        <div className="glow-ambient" />
        <div className="flex flex-col items-center gap-4 z-10">
          <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-lg shadow-purple-500/25 border border-purple-500/30 flex items-center justify-center bg-purple-950/30">
            <Image src="/logo.png" alt="Logo" width={40} height={40} priority className="w-full h-full object-cover" />
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <RefreshCw size={13} className="animate-spin text-purple-400" />
            <span>Carregando painel...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08090D] text-slate-100 flex flex-col md:flex-row relative selection:bg-purple-500/30 selection:text-purple-200">
      
      {/* Luz ambiente difusa no topo */}
      <div className="glow-ambient" />

      {/* Barra de Notificações Toast */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-3">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`pointer-events-auto p-3.5 rounded-2xl text-xs font-medium backdrop-blur-2xl shadow-2xl flex items-center gap-2.5 animate-in slide-in-from-bottom-2 border ${
              t.type === 'success' ? 'bg-emerald-950/80 text-emerald-200 border-emerald-500/30' : 
              t.type === 'error' ? 'bg-red-950/80 text-red-200 border-red-500/30' : 
              'bg-purple-950/80 text-purple-200 border-purple-500/30'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
            {t.type === 'error' && <AlertCircle size={16} className="text-red-400 shrink-0" />}
            {t.type === 'info' && <Info size={16} className="text-purple-400 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Header Mobile Minimalista */}
      <header className="md:hidden flex items-center justify-between p-4 glass-panel border-b border-white/[0.06] sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl overflow-hidden shadow-md shadow-purple-500/20 border border-purple-500/30">
            <Image src="/logo.png" alt="Logo" width={32} height={32} priority className="w-full h-full object-cover" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">Disparador</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          aria-label="Abrir menu"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Sidebar Desktop Minimalista e Translúcida */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 glass-panel border-r border-white/[0.06] flex flex-col justify-between p-5 transition-transform duration-300 md:translate-x-0 md:sticky md:top-0 md:h-screen shrink-0 overflow-y-auto
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-6 px-2">
            <div className="w-9 h-9 rounded-2xl overflow-hidden shadow-lg shadow-purple-500/25 border border-purple-500/30">
              <Image src="/logo.png" alt="Logo" width={36} height={36} priority className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">Disparador</span>
              <span className="text-[10px] text-purple-400 font-mono">PROSPECTOR SAAS</span>
            </div>
          </div>

          {/* Card da Empresa / Workspace ({minhaEmpresa}) */}
          <div className="mb-5 p-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-hidden min-w-0">
              <div className="w-7 h-7 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                <Building2 size={13} />
              </div>
              <div className="overflow-hidden min-w-0">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-mono block">EMPRESA ({`{minhaEmpresa}`})</span>
                <p className="text-xs font-semibold text-slate-200 truncate" title={workspaceName || 'Minha Empresa'}>
                  {workspaceName || 'Minha Empresa'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingWorkspaceName(workspaceName || '');
                setIsWorkspaceModalOpen(true);
              }}
              className="p-1.5 text-slate-400 hover:text-purple-300 hover:bg-white/[0.06] rounded-xl transition-colors cursor-pointer shrink-0"
              title="Editar nome da empresa"
            >
              <Edit2 size={13} />
            </button>
          </div>

          {/* Navegação */}
          <nav className="space-y-1.5">
            <button
              onClick={() => {
                setActiveTab('campaigns');
                setIsMobileMenuOpen(false);
              }}
              className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'campaigns'
                  ? 'bg-white/[0.08] border border-white/[0.1] text-white shadow-inner'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Activity size={16} className={activeTab === 'campaigns' ? 'text-purple-400' : 'text-slate-500'} />
                <span>Minhas Campanhas</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400">
                {campaigns.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('history');
                setIsMobileMenuOpen(false);
                fetchHistory(1, historySearch);
              }}
              className={`w-full px-3 py-2 rounded-xl flex items-center justify-between text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-white/[0.08] border border-white/[0.1] text-white shadow-inner'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center gap-3">
                <History size={16} className={activeTab === 'history' ? 'text-purple-400' : 'text-slate-500'} />
                <span>Histórico de Contatos</span>
              </div>
              {historyStats.totalCompanies > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                  {historyStats.totalCompanies}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsTutorialOpen(true)}
              className="w-full px-3 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.03] transition-colors flex items-center gap-3 text-xs font-medium text-left cursor-pointer"
            >
              <BookOpen size={16} className="text-slate-500" />
              <span>Tutorial Apify</span>
            </button>
          </nav>
        </div>

        {/* Perfil & Logout */}
        <div className="pt-4 border-t border-white/[0.06] space-y-3">
          <div className="px-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono block mb-1">CONTA</span>
            <div className="flex items-center justify-between gap-1">
              <p className="text-xs font-semibold text-slate-200 truncate">{user?.name || user?.email || 'Carregando...'}</p>
              {!user ? (
                <div className="h-4 w-12 bg-white/[0.06] rounded animate-pulse shrink-0" />
              ) : user.role === 'ADMIN' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[10px] font-bold shrink-0">
                  <Crown size={10} className="text-purple-400" />
                  VIP
                </span>
              ) : user.subscriptionStatus === 'ACTIVE' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold shrink-0">
                  <CheckCircle2 size={10} className="text-emerald-400" />
                  Ativo
                </span>
              ) : (
                <button
                  onClick={() => setIsSubscriptionModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-semibold shrink-0 hover:bg-amber-500/20 cursor-pointer"
                >
                  <AlertTriangle size={10} className="text-amber-400" />
                  Renovar
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 truncate font-mono mt-0.5">{user?.email}</p>
          </div>
          <button 
            onClick={() => {
              logout();
              router.push('/login');
            }} 
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
          >
            <LogOut size={14} />
            <span>Encerrar Sessão</span>
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full space-y-6 relative z-10">
        
        {/* Banner de Regularização de Conta Necessária */}
        {verificationRequiredMessage && (
          <div className="glass-panel rounded-2xl p-4 border border-amber-500/40 bg-amber-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white">Regularização de Conta Necessária</h3>
                <p className="text-[11px] text-amber-300/90">{verificationRequiredMessage}</p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                router.push('/register');
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all shrink-0 cursor-pointer"
            >
              Regularizar no Cadastre-se →
            </button>
          </div>
        )}

        {/* Banner de Assinatura Inativa / Vencida */}
        {user && user.role !== 'ADMIN' && user.subscriptionStatus !== 'ACTIVE' && (
          <div className="glass-panel rounded-2xl p-4 border border-amber-500/30 bg-amber-500/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <CreditCard size={18} />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-white">Sua assinatura está inativa ou expirada</h3>
                <p className="text-[11px] text-slate-400">Ative seu plano para liberar a conexão do WhatsApp, importação de leads e disparos.</p>
              </div>
            </div>
            <a
              href="https://pay.cakto.com.br/at474et_1080517"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary-dark px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Zap size={14} />
              <span>Assinar Plano Mensal</span>
            </a>
          </div>
        )}

        {/* Top Header com Botão de Ação */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Visão Geral</h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <p className="text-xs text-slate-400">Gerencie suas campanhas de prospecção com automação e segurança anti-bloqueio.</p>
              {lastSyncTime && (
                <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.08]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Atualizado às {new Date(lastSyncTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
              {syncError && (
                <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20" title={syncError}>
                  <AlertCircle size={11} />
                  Aviso de conexão
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <button 
              onClick={() => setIsTutorialOpen(true)}
              className="btn-secondary-dark px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <HelpCircle size={14} className="text-purple-400" />
              <span>Como extrair leads</span>
            </button>
            <button 
              onClick={openNewCampaignModal}
              className="btn-primary-dark px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={15} />
              <span>Nova Campanha</span>
            </button>
          </div>
        </div>

        {/* Status do WhatsApp Minimalista com LED Neon */}
        <section className="glass-panel rounded-3xl p-5 border border-white/[0.08] relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                waStatus?.status === 'CONNECTED' 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.2)]' 
                  : waStatus?.status === 'QRCODE'
                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                  : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
              }`}>
                <Smartphone size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-sm sm:text-base text-white">WhatsApp de Disparo</h2>
                  <span className="relative flex h-2 w-2">
                    {waStatus?.status === 'CONNECTED' && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      waStatus?.status === 'CONNECTED' ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 
                      waStatus?.status === 'QRCODE' ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'
                    }`}></span>
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {waStatus?.status === 'CONNECTED' 
                    ? 'Conexão ativa e segura na VPS com simulação humana' 
                    : waStatus?.status === 'QRCODE' 
                    ? 'Aguardando leitura do QR Code no aplicativo' 
                    : 'Nenhum número pareado no momento'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {waStatus?.status === 'DISCONNECTED' && (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="btn-primary-dark px-4 py-2 rounded-xl text-xs cursor-pointer flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {connecting ? <RefreshCw size={15} className="animate-spin" /> : <QrCode size={15} />}
                  <span>{connecting ? 'Iniciando...' : 'Conectar WhatsApp'}</span>
                </button>
              )}
              {waStatus?.status === 'QRCODE' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="btn-secondary-dark px-3 py-1.5 rounded-xl text-xs cursor-pointer text-purple-300 border-purple-500/30 hover:bg-purple-500/10 disabled:opacity-60 flex items-center gap-1.5"
                  >
                    {connecting && <RefreshCw size={12} className="animate-spin" />}
                    🔄 Atualizar QR
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={connecting}
                    className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              )}
              {waStatus?.status === 'CONNECTED' && (
                <button
                  onClick={handleDisconnect}
                  disabled={connecting}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all cursor-pointer disabled:opacity-60 flex items-center gap-1.5"
                >
                  {connecting && <RefreshCw size={12} className="animate-spin" />}
                  {connecting ? 'Desconectando...' : 'Desconectar'}
                </button>
              )}
            </div>
          </div>

          {/* Exibição do QR Code ou Código de Pareamento quando em processo de conexão */}
          {waStatus?.status === 'QRCODE' && (
            <div className="mt-5 pt-5 border-t border-white/[0.06] flex flex-col items-center justify-center animate-in fade-in">
              {/* Abas de Alternância: QR Code vs Código por Número */}
              <div className="flex items-center p-1 bg-white/[0.04] border border-white/[0.08] rounded-xl mb-4">
                <button
                  type="button"
                  onClick={() => setPairingMode('qr')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    pairingMode === 'qr'
                      ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <QrCode size={13} />
                  <span>Escanear QR Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPairingMode('code')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    pairingMode === 'code'
                      ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone size={13} />
                  <span>Conectar via Código (Sem Câmera)</span>
                </button>
              </div>

              {pairingMode === 'qr' && waStatus.qrCode && (
                <div className="flex flex-col items-center">
                  <div className="p-3 bg-white rounded-2xl shadow-2xl border border-white/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={waStatus.qrCode} 
                      alt="QR Code WhatsApp" 
                      className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl object-contain"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-3 text-center max-w-sm">
                    Abra o WhatsApp no celular ➔ <b>Aparelhos Conectados</b> ➔ <b>Conectar um aparelho</b> e aponte a câmera.
                  </p>
                </div>
              )}

              {pairingMode === 'code' && (
                <div className="w-full max-w-sm bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 flex flex-col items-center">
                  {!pairingCode ? (
                    <form onSubmit={handleRequestPairingCode} className="w-full space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Seu número de WhatsApp com DDD:
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: 21 99741-1009"
                          value={pairingPhone}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                            if (digits.length <= 2) {
                              setPairingPhone(digits);
                            } else if (digits.length <= 7) {
                              setPairingPhone(`(${digits.slice(0, 2)}) ${digits.slice(2)}`);
                            } else {
                              setPairingPhone(`(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`);
                            }
                          }}
                          className="w-full px-3 py-2 text-sm rounded-xl bg-black/40 border border-white/[0.1] text-white focus:border-purple-500 focus:outline-none placeholder:text-slate-600 font-mono"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isPairingLoading}
                        className="btn-primary-dark w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isPairingLoading && <RefreshCw size={13} className="animate-spin" />}
                        <span>{isPairingLoading ? 'Gerando Código...' : 'Gerar Código de Pareamento'}</span>
                      </button>
                      <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                        Não precisa de câmera. Você receberá um código de 8 dígitos para digitar no aplicativo do WhatsApp.
                      </p>
                    </form>
                  ) : (
                    <div className="w-full flex flex-col items-center space-y-3">
                      <span className="text-xs text-slate-400">Digite este código no seu WhatsApp:</span>
                      <div className="flex items-center gap-2">
                        <div className="px-5 py-3 rounded-2xl bg-purple-500/20 border border-purple-500/40 text-purple-200 text-2xl sm:text-3xl font-mono font-bold tracking-widest shadow-[0_0_20px_rgba(168,85,247,0.25)] select-all">
                          {pairingCode}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (pairingCode) {
                              navigator.clipboard.writeText(pairingCode);
                              addToast('success', 'Código copiado para a área de transferência!');
                            }
                          }}
                          className="p-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-slate-300 hover:text-white transition-all cursor-pointer"
                          title="Copiar código"
                        >
                          <Copy size={18} />
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400 text-center space-y-1 bg-black/30 p-3 rounded-xl border border-white/[0.05] w-full">
                        <p>1. No WhatsApp do celular, vá em <b>Aparelhos Conectados</b></p>
                        <p>2. Toque em <b>Conectar um aparelho</b></p>
                        <p>3. Toque em <b>Conectar com número de telefone</b> (no rodapé)</p>
                        <p>4. Digite o código de 8 dígitos exibido acima</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPairingCode(null)}
                        className="text-xs text-purple-400 hover:text-purple-300 underline cursor-pointer mt-1"
                      >
                        Gerar outro código / Mudar número
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Navegação por Abas: Campanhas x Histórico de Disparos */}
        <div className="flex items-center gap-2 border-b border-white/[0.08] pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('campaigns')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'campaigns'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Layers size={15} />
            <span>Minhas Campanhas</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/[0.08] text-slate-300 font-mono">
              {campaigns.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              fetchHistory(1, historySearch);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <History size={15} />
            <span>Histórico de Empresas Contatadas</span>
            {historyStats.totalCompanies > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-purple-500/20 text-purple-300 font-mono">
                {historyStats.totalCompanies}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'campaigns' && (
          <>
            {/* Cards de Métricas (KPIs Globais) */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Campanhas</span>
              <Layers size={15} className="text-purple-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{campaigns.length}</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Configuradas na conta</div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Total Leads</span>
              <Users size={15} className="text-indigo-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{totalLeadsGlobal}</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Importados do Apify</div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Anti-Bloqueio</span>
              <ShieldCheck size={15} className="text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400">Ativo</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Delays + Pausas de lote</div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Servidor VPS</span>
              <Zap size={15} className="text-amber-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-amber-400">24/7 Online</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Execução em background</div>
          </div>
        </section>

        {/* Lista de Campanhas */}
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Minhas Campanhas</h2>
            <span className="text-xs text-slate-500 font-mono">{campaigns.length} total</span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-3.5" aria-busy="true" aria-label="Carregando campanhas">
              {[0, 1, 2].map(i => (
                <div key={i} className="glass-card rounded-2xl p-4 sm:p-5 border border-white/[0.07] animate-pulse">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-2.5 flex-1">
                      <div className="h-4 w-2/5 rounded-lg bg-white/[0.08]" />
                      <div className="h-3 w-1/3 rounded-lg bg-white/[0.05]" />
                      <div className="h-1.5 w-full rounded-full bg-white/[0.06]" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-8 w-8 rounded-xl bg-white/[0.06]" />
                      <div className="h-8 w-20 rounded-xl bg-white/[0.06]" />
                      <div className="h-8 w-8 rounded-xl bg-white/[0.06]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="glass-panel rounded-3xl p-10 sm:p-14 text-center border border-dashed border-white/[0.1] flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-4">
                <FileJson size={24} />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Nenhuma campanha criada ainda</h3>
              <p className="text-xs text-slate-400 max-w-sm mb-6 leading-relaxed">
                Extraia seus leads no Google Maps Scraper (Apify), crie sua campanha e comece a disparar no automático.
              </p>
              <button 
                onClick={openNewCampaignModal}
                className="btn-primary-dark px-5 py-2.5 rounded-xl text-xs cursor-pointer flex items-center gap-2"
              >
                <Plus size={15} />
                <span>Criar Primeira Campanha</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {campaigns.map(camp => (
                <div 
                  key={camp.id} 
                  className="glass-card rounded-2xl p-4 sm:p-5 border border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-sm sm:text-base text-white">{camp.name}</h3>
                      {camp.status === 'RUNNING' && statsMap[camp.id]?.scheduleStatus && !statsMap[camp.id]?.scheduleStatus?.isInWindow ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          <Clock size={10} className="text-amber-400" />
                          FORA DO HORÁRIO
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider ${
                          camp.status === 'RUNNING' 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse' 
                            : camp.status === 'COMPLETED'
                            ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                            : 'bg-white/[0.05] text-slate-400 border border-white/[0.1]'
                        }`}>
                          {camp.status === 'STARTING' ? 'PREPARANDO' : camp.status === 'RUNNING' ? 'EM EXECUÇÃO' : camp.status === 'COMPLETED' ? 'CONCLUÍDA' : 'PAUSADA'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users size={13} className="text-slate-500" />
                        <b>{camp._count?.leads || 0}</b> leads
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={13} className="text-slate-500" />
                        Delay: <b>{camp.delayMin}s - {camp.delayMax}s</b>
                      </span>
                      {camp.scheduleStartMinute !== undefined && camp.scheduleEndMinute !== undefined && (
                        <span className="flex items-center gap-1" title="Janela de envio permitida (horário de Brasília)">
                          <Calendar size={13} className="text-purple-400" />
                          <b>{String(Math.floor(camp.scheduleStartMinute / 60)).padStart(2, '0')}:{String(camp.scheduleStartMinute % 60).padStart(2, '0')}</b> às{' '}
                          <b>{String(Math.floor(camp.scheduleEndMinute / 60)).padStart(2, '0')}:{String(camp.scheduleEndMinute % 60).padStart(2, '0')}</b>
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(camp.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    {/* Aviso de Janela Comercial Fechada (anti-bloqueio automático) */}
                    {camp.status === 'RUNNING' && statsMap[camp.id]?.scheduleStatus && !statsMap[camp.id]?.scheduleStatus?.isInWindow && (
                      <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-start gap-2">
                        <Clock size={15} className="shrink-0 mt-0.5 text-amber-400" />
                        <div className="space-y-0.5">
                          <div className="font-semibold flex items-center gap-1.5 text-amber-200">
                            <span>Aguardando Janela Comercial</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">Pausa Automática</span>
                          </div>
                          <p className="text-[11px] text-amber-300/80 leading-relaxed">
                            Envios suspensos fora do horário/dia configurado.
                            {statsMap[camp.id]?.scheduleStatus?.nextOpenTimestamp && (
                              <> Retomada automática prevista para <b>{formatNextOpen(statsMap[camp.id].scheduleStatus!.nextOpenTimestamp!)}</b>.</>
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Barra de progresso real (derivada dos status dos leads no banco) */}
                    {statsMap[camp.id] && statsMap[camp.id].total > 0 && (statsMap[camp.id].progress > 0 || camp.status === 'RUNNING') && (
                      <div className="pt-1 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-400">
                            <span className="text-emerald-400">{statsMap[camp.id].sent + statsMap[camp.id].replied}</span>
                            {' '}enviados
                            {statsMap[camp.id].replied > 0 && (
                              <> · <span className="text-purple-400">{statsMap[camp.id].replied}</span> respostas</>
                            )}
                            {statsMap[camp.id].error > 0 && (
                              <> · <span className="text-red-400">{statsMap[camp.id].error}</span> erros</>
                            )}
                          </span>
                          <span className="text-slate-500">
                            {statsMap[camp.id].progress}%
                            {camp.status === 'RUNNING' && 
                             statsMap[camp.id].estimatedSecondsRemaining !== null && 
                             (!statsMap[camp.id]?.scheduleStatus || statsMap[camp.id]?.scheduleStatus?.isInWindow) && (
                              <> · restam {formatEta(statsMap[camp.id].estimatedSecondsRemaining!)}</>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              camp.status === 'RUNNING' ? 'bg-gradient-to-r from-purple-500 to-emerald-400' : 'bg-purple-500/60'
                            }`}
                            style={{ width: `${statsMap[camp.id].progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {camp.status === 'RUNNING' ? (
                      <button
                        onClick={() => handlePause(camp.id)}
                        disabled={actionLoading === camp.id}
                        className="p-2 rounded-xl text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Pausar Campanha"
                      >
                        {actionLoading === camp.id ? <RefreshCw size={16} className="animate-spin" /> : <Pause size={16} />}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStart(camp.id)}
                        disabled={camp.status === 'STARTING' || waStatus?.status !== 'CONNECTED' || actionLoading === camp.id}
                        className="btn-primary-dark p-2 rounded-xl text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        title={waStatus?.status !== 'CONNECTED' ? 'Conecte o WhatsApp para iniciar' : 'Iniciar Campanha'}
                      >
                        {actionLoading === camp.id ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                      </button>
                    )}

                    <button 
                      onClick={() => openCampaignDetails(camp.id)}
                      className="btn-secondary-dark px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye size={14} />
                      <span>Ver Leads</span>
                    </button>

                    <button 
                      onClick={() => setCampaignToDelete(camp)}
                      disabled={camp.status === 'STARTING'}
                      className="p-2 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Excluir Campanha"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </>
    )}

    {/* VISÃO: HISTÓRICO DE EMPRESAS CONTATADAS */}
    {activeTab === 'history' && (
      <div className="space-y-6 animate-in fade-in">
        {/* KPIs do Histórico */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Contatos Únicos</span>
              <Users size={15} className="text-purple-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{historyStats.totalCompanies}</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Telefones únicos contatados</div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Disparos Efetivados</span>
              <Zap size={15} className="text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-400">{historyStats.totalDispatches}</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Total de mensagens entregues</div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Persistência</span>
              <ShieldCheck size={15} className="text-indigo-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-indigo-400">Permanente</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Independente de campanhas</div>
          </div>

          <div className="glass-card rounded-2xl p-4 border border-white/[0.07]">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider">Isolamento</span>
              <CheckCircle2 size={15} className="text-sky-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-sky-400">100% Seguro</div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">Exclusivo do seu Workspace</div>
          </div>
        </section>

        {/* Cabeçalho da Tabela e Barra de Busca */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <History size={16} className="text-purple-400" />
                <span>Empresas que Já Receberam Disparos</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Histórico mantido permanentemente mesmo se você apagar a campanha original.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar por empresa, telefone, bairro..."
                  value={historySearch}
                  onChange={e => {
                    setHistorySearch(e.target.value);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      fetchHistory(1, historySearch);
                    }
                  }}
                  className="w-full pl-9 pr-8 py-2 text-xs glass-input rounded-xl"
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistorySearch('');
                      fetchHistory(1, '');
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white text-xs cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => fetchHistory(1, historySearch)}
                className="btn-secondary-dark px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Pesquisar"
              >
                <Search size={13} />
                <span className="hidden sm:inline">Buscar</span>
              </button>
            </div>
          </div>

          {/* Tabela do Histórico */}
          <div className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] border-b border-white/[0.08] text-slate-400 font-semibold">
                  <tr>
                    <th className="p-3">Empresa</th>
                    <th className="p-3">Telefone</th>
                    <th className="p-3">Site / Bairro</th>
                    <th className="p-3">1º Contato</th>
                    <th className="p-3">Último Contato</th>
                    <th className="p-3 text-center">Envios</th>
                    <th className="p-3">Última Campanha</th>
                    <th className="p-3 text-center">Última Mensagem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw size={15} className="animate-spin text-purple-400" />
                          <span>Carregando histórico de disparos...</span>
                        </div>
                      </td>
                    </tr>
                  ) : historyItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-500">
                        <div className="flex flex-col items-center max-w-sm mx-auto space-y-2">
                          <History size={28} className="text-slate-600 mb-1" />
                          <p className="font-semibold text-slate-300">Nenhum histórico de disparo encontrado</p>
                          <p className="text-xs text-slate-500">
                            {historySearch
                              ? 'Nenhum contato corresponde ao termo de busca pesquisado.'
                              : 'Conforme suas campanhas forem enviando mensagens com sucesso, o histórico consolidado aparecerá aqui.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    historyItems.map(item => (
                      <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="p-3 font-semibold text-slate-200 max-w-[180px] truncate" title={item.companyTitle}>
                          {item.companyTitle}
                        </td>
                        <td className="p-3 text-slate-300 font-mono whitespace-nowrap">
                          {formatPhone(item.phone)}
                        </td>
                        <td className="p-3 text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {item.website ? (
                              <a
                                href={item.website.startsWith('http') ? item.website : `https://${item.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded font-medium border border-emerald-500/20 transition-colors"
                                title={item.website}
                              >
                                <Globe size={11} /> Site
                              </a>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Sem site</span>
                            )}
                            {item.neighborhood && (
                              <span className="inline-flex items-center gap-0.5 text-slate-400 text-[11px] truncate max-w-[120px]" title={item.neighborhood}>
                                <MapPin size={11} className="text-slate-500 shrink-0" /> {item.neighborhood}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-slate-400 whitespace-nowrap font-mono text-[11px]">
                          {new Date(item.firstSentAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="p-3 text-slate-300 whitespace-nowrap font-mono text-[11px]">
                          {new Date(item.lastSentAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            item.sendCount > 1
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-white/[0.06] text-slate-300 border border-white/[0.1]'
                          }`}>
                            {item.sendCount}x
                          </span>
                        </td>
                        <td className="p-3 text-slate-300 max-w-[160px] truncate" title={item.lastCampaignName || ''}>
                          {item.lastCampaignName || '—'}
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {item.lastMessage ? (
                            <button
                              type="button"
                              onClick={() => setSelectedHistoryMessage(item)}
                              className="btn-secondary-dark px-2.5 py-1 rounded-lg text-[11px] inline-flex items-center gap-1.5 hover:text-purple-300 hover:border-purple-500/40 cursor-pointer"
                              title="Visualizar última mensagem enviada"
                            >
                              <Eye size={12} className="text-purple-400" />
                              <span>Ver Mensagem</span>
                            </button>
                          ) : (
                            <span className="text-slate-600 text-[11px]">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {historyPagination.totalPages > 1 && (
              <div className="p-3 bg-white/[0.02] border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
                <div>
                  Mostrando página <b className="text-slate-200">{historyPagination.page}</b> de{' '}
                  <b className="text-slate-200">{historyPagination.totalPages}</b> ({historyPagination.total} contatos)
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={historyPagination.page <= 1 || historyLoading}
                    onClick={() => fetchHistory(historyPagination.page - 1, historySearch)}
                    className="btn-secondary-dark px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={13} />
                    <span>Anterior</span>
                  </button>
                  <button
                    type="button"
                    disabled={historyPagination.page >= historyPagination.totalPages || historyLoading}
                    onClick={() => fetchHistory(historyPagination.page + 1, historySearch)}
                    className="btn-secondary-dark px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Próxima</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    )}

      </main>

      {/* Modal: Nova Campanha (Dark Glassmorphism) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">Criar Nova Campanha</h2>
                <p className="text-xs text-slate-400 mt-0.5">Importe seus leads e configure suas mensagens inteligentes.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="p-5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
              
              {/* Banner de Rascunho Restaurado */}
              {hasRestoredDraft && (
                <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-between text-xs text-purple-200">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-purple-400 shrink-0" />
                    <span>Rascunho recuperado automaticamente do seu último preenchimento.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      clearDraft();
                      setNewCampaign({
                        name: '',
                        messageComSite: '',
                        messageSemSite: '',
                        file: null,
                        delayMin: 90,
                        delayMax: 180,
                        scheduleStartMinute: 480,
                        scheduleEndMinute: 1200,
                        scheduleDays: '1,2,3,4,5',
                        scheduleTimezone: 'America/Sao_Paulo',
                        recontactAfterDays: 30
                      });
                      setImportPreview({ loading: false, error: null, diagnostic: null });
                      addToast('info', 'Rascunho descartado com sucesso.');
                    }}
                    className="text-purple-400 hover:text-purple-200 underline text-xs font-semibold cursor-pointer shrink-0 ml-2"
                  >
                    Descartar rascunho
                  </button>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Nome da Campanha</label>
                <input 
                  type="text" 
                  required
                  autoFocus
                  value={newCampaign.name}
                  onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
                  className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
                  placeholder="Ex: Clínicas Odontológicas - São Paulo"
                />
              </div>

              {/* Upload de Arquivo com Prévia em Tempo Real */}
              <div className="glass-card p-4 rounded-2xl border border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Arquivo de Leads (.JSON ou .CSV)
                  </label>
                  <button 
                    type="button" 
                    onClick={() => setIsTutorialOpen(true)}
                    className="text-xs text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle size={13} /> Como gerar?
                  </button>
                </div>
                
                <input 
                  type="file" 
                  accept=".json,.csv,text/csv,application/json"
                  required
                  onChange={e => handleFileChange(e.target.files ? e.target.files[0] : null)}
                  className="block w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-500 file:transition-colors cursor-pointer"
                />
                
                <p className="text-[10px] text-slate-500 font-mono">
                  Compatível com exportações do Apify Google Maps Scraper (.JSON) e planilhas .CSV (com delimitador vírgula, ponto-e-vírgula ou tabulação).
                </p>

                {/* Carregando Prévia */}
                {importPreview.loading && (
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center gap-2.5 text-xs text-purple-200">
                    <RefreshCw size={14} className="animate-spin text-purple-400" />
                    <span>Analisando arquivo, validando números de WhatsApp e verificando histórico de recontato...</span>
                  </div>
                )}

                {/* Erro na Prévia */}
                {importPreview.error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 flex items-start gap-2 text-xs text-red-300">
                    <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                    <span>{importPreview.error}</span>
                  </div>
                )}

                {/* Diagnóstico Completo da Prévia */}
                {importPreview.diagnostic && (
                  <div className="space-y-3 pt-2 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                        <FileCheck size={14} className="text-emerald-400" />
                        Diagnóstico da Lista ({importPreview.diagnostic.totalRows} registros lidos)
                      </span>
                      {importPreview.diagnostic.validCount > 0 ? (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {importPreview.diagnostic.validCount} aptos para envio
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                          Nenhum lead apto
                        </span>
                      )}
                    </div>

                    {/* 4 Cards de Categorias Mutuamente Exclusivas */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <span className="text-[10px] text-emerald-300 font-semibold block">Aptos p/ Disparo</span>
                        <p className="text-base font-bold text-emerald-400 mt-0.5">{importPreview.diagnostic.validCount}</p>
                        {importPreview.diagnostic.alreadyContactedCount > 0 && (
                          <span className="text-[9px] text-amber-300/90 block mt-0.5">
                            ({importPreview.diagnostic.alreadyContactedCount} com histórico)
                          </span>
                        )}
                      </div>

                      <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <span className="text-[10px] text-amber-300 font-semibold block">Duplicados</span>
                        <p className="text-base font-bold text-amber-400 mt-0.5">{importPreview.diagnostic.duplicateCount}</p>
                        <span className="text-[9px] text-slate-400 block mt-0.5">Ignorados auto</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <span className="text-[10px] text-rose-300 font-semibold block">Inválidos / S/ Tel</span>
                        <p className="text-base font-bold text-rose-400 mt-0.5">{importPreview.diagnostic.invalidCount}</p>
                        <span className="text-[9px] text-slate-400 block mt-0.5">Descartados</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                        <span className="text-[10px] text-purple-300 font-semibold block">Recontato Bloqueado</span>
                        <p className="text-base font-bold text-purple-400 mt-0.5">{importPreview.diagnostic.recontactBlockedCount}</p>
                        <span className="text-[9px] text-slate-400 block mt-0.5">Regra {newCampaign.recontactAfterDays}d</span>
                      </div>
                    </div>

                    {/* Amostra dos Primeiros Contatos Classificados */}
                    {importPreview.diagnostic.sampleLeads && importPreview.diagnostic.sampleLeads.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-black/40 border border-white/[0.04] space-y-1.5">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Amostra de Leads Classificados (Primeiras Linhas)
                        </span>
                        <div className="space-y-1">
                          {importPreview.diagnostic.sampleLeads.slice(0, 3).map((s, idx) => (
                            <div key={idx} className="flex items-center justify-between text-[11px] p-1.5 rounded-lg bg-white/[0.02]">
                              <div className="flex items-center gap-2 truncate max-w-[70%]">
                                <span className="font-semibold text-slate-200 truncate">{s.title}</span>
                                <span className="text-slate-400 font-mono text-[10px]">{s.phone}</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {s.website ? (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 text-[9px] border border-emerald-500/20">
                                    Com Site
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded bg-slate-500/10 text-slate-400 text-[9px]">
                                    Sem Site
                                  </span>
                                )}
                                {s.alreadyContacted && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 text-[9px] border border-amber-500/20" title="Contato com envio anterior">
                                    Já Contatado
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Inconsistências identificadas */}
                    {importPreview.diagnostic.issues && importPreview.diagnostic.issues.length > 0 && (
                      <details className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] text-[11px]">
                        <summary className="font-semibold text-slate-300 cursor-pointer hover:text-white transition-colors">
                          ⚠️ Ver inconsistências do arquivo ({importPreview.diagnostic.issues.length})
                        </summary>
                        <div className="mt-2 space-y-1 max-h-36 overflow-y-auto">
                          {importPreview.diagnostic.issues.map((iss, i) => (
                            <div key={i} className="text-[10px] p-1.5 rounded bg-black/30 border border-white/[0.03] flex items-start gap-2">
                              <span className="font-mono text-purple-300 shrink-0">Linha {iss.row}:</span>
                              <span className="text-slate-300">{iss.reason}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}
              </div>

              {/* Política de Recontato Inteligente */}
              <div className="glass-card p-4 rounded-2xl border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Política de Proteção contra Recontato
                  </label>
                  <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    Anti-Spam
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Bloqueia automaticamente contatos que já receberam disparos recentes da sua empresa para evitar denúncias no WhatsApp.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
                  {[
                    { days: 0, label: 'Livre (0 dias)', desc: 'Ignora histórico' },
                    { days: 15, label: '15 dias', desc: 'Recontato quinzenal' },
                    { days: 30, label: '30 dias', desc: 'Recomendado' },
                    { days: 60, label: '60 dias', desc: 'Bimestral' },
                    { days: 90, label: '90 dias', desc: 'Trimestral' }
                  ].map(opt => {
                    const isSelected = newCampaign.recontactAfterDays === opt.days;
                    return (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() => {
                          setNewCampaign(prev => ({ ...prev, recontactAfterDays: opt.days }));
                          if (newCampaign.file) {
                            handleFileChange(newCampaign.file, opt.days);
                          }
                        }}
                        className={`p-2 rounded-xl text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600/30 border border-purple-500/50 text-white shadow-sm'
                            : 'bg-white/[0.03] border border-white/[0.06] text-slate-300 hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="text-xs font-bold block">{opt.label}</span>
                        <span className="text-[9px] text-slate-400 block">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sugestões de Copys de Alta Conversão */}
              <div className="glass-card p-4 rounded-2xl border border-purple-500/20 bg-purple-950/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    💡 Sugestões de Copys Validadas
                  </span>
                  <span className="text-[10px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                    Clique para Inserir
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Escreva seu próprio texto ou use uma das copys validadas abaixo:
                </p>
                <div className="flex flex-wrap gap-2">
                  {lastUsedCopy && (lastUsedCopy.messageComSite || lastUsedCopy.messageSemSite) && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewCampaign(prev => ({
                          ...prev,
                          messageComSite: lastUsedCopy.messageComSite || '',
                          messageSemSite: lastUsedCopy.messageSemSite || ''
                        }));
                        addToast('info', 'Última copy usada restaurada!');
                      }}
                      className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Restaurar a última abordagem personalizada que você utilizou"
                    >
                      <RefreshCw size={12} />
                      <span>🔄 Restaurar última copy usada</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNewCampaign({
                      ...newCampaign,
                      messageSemSite: defaultSemSite,
                      messageComSite: defaultComSite
                    })}
                    className="px-2.5 py-1.5 bg-white/[0.06] hover:bg-purple-600/30 border border-white/10 hover:border-purple-500/40 text-purple-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                  >
                    🚀 Kit Completo (Com e Sem Site)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCampaign({ ...newCampaign, messageSemSite: defaultSemSite })}
                    className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    ✨ Venda de Site (Sem Site)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCampaign({ ...newCampaign, messageComSite: defaultComSite })}
                    className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    🎯 Triagem WhatsApp (Com Site)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCampaign({ ...newCampaign, messageSemSite: defaultB2B })}
                    className="px-2.5 py-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 rounded-xl text-xs transition-all cursor-pointer"
                  >
                    💼 Prospecção B2B Direta
                  </button>
                </div>
              </div>

              {/* Delays */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Delay Mínimo (segundos)</label>
                  <input 
                    type="number" 
                    required
                    min={10}
                    value={newCampaign.delayMin}
                    onChange={e => setNewCampaign({...newCampaign, delayMin: Number(e.target.value)})}
                    className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">Recomendado: 90s</p>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Delay Máximo (segundos)</label>
                  <input 
                    type="number" 
                    required
                    min={10}
                    value={newCampaign.delayMax}
                    onChange={e => setNewCampaign({...newCampaign, delayMax: Number(e.target.value)})}
                    className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">Recomendado: 180s</p>
                </div>
              </div>

              {/* Horários e Dias de Envio (Janela Comercial) */}
              <div className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(!isScheduleOpen)}
                  className="w-full p-3.5 sm:p-4 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Clock size={16} className="text-purple-400" />
                    <div>
                      <span className="text-xs font-bold text-white block">
                        Horários e Dias de Envio (Janela Comercial)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {String(Math.floor(newCampaign.scheduleStartMinute / 60)).padStart(2, '0')}:
                        {String(newCampaign.scheduleStartMinute % 60).padStart(2, '0')} às{' '}
                        {String(Math.floor(newCampaign.scheduleEndMinute / 60)).padStart(2, '0')}:
                        {String(newCampaign.scheduleEndMinute % 60).padStart(2, '0')} · {
                          newCampaign.scheduleDays.split(',').filter(Boolean).length === 7 ? 'Todos os dias' :
                          newCampaign.scheduleDays === '1,2,3,4,5' ? 'Seg a Sex' :
                          `${newCampaign.scheduleDays.split(',').filter(Boolean).length} dia(s) selecionado(s)`
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                      Anti-Bloqueio
                    </span>
                    {isScheduleOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                  </div>
                </button>

                {isScheduleOpen && (
                  <div className="p-4 pt-0 space-y-4 border-t border-white/[0.04] mt-1 text-xs">
                    <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-200 text-[11px] flex items-center justify-between">
                      <span>Fuso Horário Oficial: <b>América/São Paulo (Horário de Brasília)</b></span>
                      <span className="font-mono text-[10px] text-purple-300">GMT-3</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                          Início dos Disparos
                        </label>
                        <input
                          type="time"
                          value={`${String(Math.floor(newCampaign.scheduleStartMinute / 60)).padStart(2, '0')}:${String(newCampaign.scheduleStartMinute % 60).padStart(2, '0')}`}
                          onChange={e => {
                            const [h, m] = e.target.value.split(':').map(Number);
                            if (!isNaN(h) && !isNaN(m)) {
                              setNewCampaign({ ...newCampaign, scheduleStartMinute: h * 60 + m });
                            }
                          }}
                          className="block w-full px-3 py-2 glass-input rounded-xl text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1">
                          Término dos Disparos
                        </label>
                        <input
                          type="time"
                          value={`${String(Math.floor(newCampaign.scheduleEndMinute / 60)).padStart(2, '0')}:${String(newCampaign.scheduleEndMinute % 60).padStart(2, '0')}`}
                          onChange={e => {
                            const [h, m] = e.target.value.split(':').map(Number);
                            if (!isNaN(h) && !isNaN(m)) {
                              setNewCampaign({ ...newCampaign, scheduleEndMinute: h * 60 + m });
                            }
                          }}
                          className="block w-full px-3 py-2 glass-input rounded-xl text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Dias da Semana Permitidos
                      </label>
                      <div className="grid grid-cols-7 gap-1.5">
                        {[
                          { id: '1', label: 'Seg' },
                          { id: '2', label: 'Ter' },
                          { id: '3', label: 'Qua' },
                          { id: '4', label: 'Qui' },
                          { id: '5', label: 'Sex' },
                          { id: '6', label: 'Sáb' },
                          { id: '0', label: 'Dom' }
                        ].map(day => {
                          const currentDays = newCampaign.scheduleDays.split(',').filter(Boolean);
                          const isSelected = currentDays.includes(day.id);
                          return (
                            <button
                              key={day.id}
                              type="button"
                              onClick={() => {
                                let updated: string[];
                                if (isSelected) {
                                  updated = currentDays.filter(d => d !== day.id);
                                } else {
                                  updated = [...currentDays, day.id];
                                }
                                setNewCampaign({ ...newCampaign, scheduleDays: updated.join(',') });
                              }}
                              className={`py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-purple-600 text-white shadow-sm'
                                  : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]'
                              }`}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                      {newCampaign.scheduleDays.trim().length === 0 && (
                        <p className="text-[10px] text-red-400 mt-1">Selecione pelo menos um dia da semana.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Mensagem Principal / Sem Site */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Mensagem Principal <span className="text-purple-400 font-bold">(Para Sem Site ou Geral)</span>
                  </label>
                  <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    {newCampaign.messageComSite.trim() ? 'Leads Sem Site' : 'Enviada para Todos'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1 text-[11px] py-1">
                  <span className="text-slate-500 text-[10px] mr-1">Inserir:</span>
                  {[
                    { tag: '{nome}', label: 'Nome' },
                    { tag: '{bairro}', label: 'Bairro' },
                    { tag: '{meuNome}', label: 'Meu Nome' },
                    { tag: '{minhaEmpresa}', label: 'Minha Empresa' },
                    { tag: '{Oi|Olá|Fala}', label: 'Spintax' },
                  ].map(item => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => setNewCampaign({ ...newCampaign, messageSemSite: newCampaign.messageSemSite + item.tag })}
                      className="px-1.5 py-0.5 bg-white/[0.05] hover:bg-purple-500/20 hover:text-purple-300 border border-white/[0.08] rounded text-[10px] font-mono text-slate-300 transition-colors cursor-pointer"
                    >
                      +{item.label}
                    </button>
                  ))}
                </div>

                <textarea 
                  rows={4}
                  value={newCampaign.messageSemSite}
                  onChange={e => setNewCampaign({...newCampaign, messageSemSite: e.target.value})}
                  className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-xs sm:text-sm font-sans"
                  placeholder="Escreva sua mensagem personalizada ou clique em um dos modelos acima..."
                />
              </div>

              {/* Mensagem Opcional Com Site */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Mensagem Específica para quem <span className="text-emerald-400 font-bold">TEM SITE PRÓPRIO</span>
                  </label>
                  <span className="text-[10px] text-slate-400 bg-white/[0.05] px-2 py-0.5 rounded border border-white/[0.08]">
                    Opcional
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1 text-[11px] py-1">
                  <span className="text-slate-500 text-[10px] mr-1">Inserir:</span>
                  {[
                    { tag: '{nome}', label: 'Nome' },
                    { tag: '{website}', label: 'Website' },
                    { tag: '{bairro}', label: 'Bairro' },
                    { tag: '{meuNome}', label: 'Meu Nome' },
                    { tag: '{minhaEmpresa}', label: 'Minha Empresa' },
                    { tag: '{Oi|Olá|Fala}', label: 'Spintax' },
                  ].map(item => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => setNewCampaign({ ...newCampaign, messageComSite: newCampaign.messageComSite + item.tag })}
                      className="px-1.5 py-0.5 bg-white/[0.05] hover:bg-emerald-500/20 hover:text-emerald-300 border border-white/[0.08] rounded text-[10px] font-mono text-slate-300 transition-colors cursor-pointer"
                    >
                      +{item.label}
                    </button>
                  ))}
                </div>

                <textarea 
                  rows={4}
                  value={newCampaign.messageComSite}
                  onChange={e => setNewCampaign({...newCampaign, messageComSite: e.target.value})}
                  className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-xs sm:text-sm font-sans"
                  placeholder="Se deixar em branco, o robô enviará a mensagem principal para todos os leads..."
                />
              </div>

              {/* Simulador WhatsApp Web Dark */}
              {(newCampaign.messageSemSite.trim() || newCampaign.messageComSite.trim()) && (
                <div className="glass-card rounded-2xl border border-emerald-500/20 bg-[#0B141A]/90 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-300 text-xs font-bold">
                        WA
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block">Simulador WhatsApp Web</span>
                        <span className="text-[10px] text-emerald-400 font-mono">Disparo Real Simulado</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSpintaxSeed(s => s + 1)}
                        className="px-2 py-1 bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 rounded-lg text-[10px] font-semibold text-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Gera uma nova variação para demonstrar a alternância dinâmica de palavras"
                      >
                        <RefreshCw size={10} className={messagePreviewLoading ? 'animate-spin' : ''} />
                        <span>Sortear Spintax</span>
                      </button>
                    </div>
                  </div>

                  {/* Alternador Com Site vs Sem Site */}
                  <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/[0.06] text-xs">
                    <button
                      type="button"
                      onClick={() => setMessagePreviewTab('semSite')}
                      className={`flex-1 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                        messagePreviewTab === 'semSite'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Ver Sem Site (Principal)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMessagePreviewTab('comSite')}
                      className={`flex-1 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                        messagePreviewTab === 'comSite'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Ver Com Site Próprio
                    </button>
                  </div>

                  {/* Balão de Mensagem WhatsApp Dark */}
                  <div className="p-3.5 rounded-2xl bg-[#111B21] border border-white/[0.04] space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pb-1 border-b border-white/[0.04]">
                      <span>Para: <b>{messagePreviewTab === 'comSite' ? (messagePreviewData?.previews.comSite.lead.title || 'Empresa Exemplo') : (messagePreviewData?.previews.semSite.lead.title || 'Empresa Exemplo')}</b></span>
                      <span>Remetente: <b>{user?.name || workspaceName || 'Minha Empresa'}</b></span>
                    </div>

                    <div className="flex justify-start">
                      <div className="max-w-[90%] sm:max-w-[80%] rounded-2xl rounded-tl-sm bg-[#005c4b] text-slate-100 p-3 text-xs leading-relaxed shadow-md relative">
                        <div className="whitespace-pre-wrap font-sans">
                          {messagePreviewTab === 'comSite' 
                            ? (messagePreviewData?.previews.comSite.rendered || (newCampaign.messageComSite.trim() || newCampaign.messageSemSite.trim() || 'Digite uma mensagem...'))
                            : (messagePreviewData?.previews.semSite.rendered || (newCampaign.messageSemSite.trim() || newCampaign.messageComSite.trim() || 'Digite uma mensagem...'))
                          }
                        </div>
                        <div className="flex items-center justify-end gap-1 text-[9px] text-emerald-200/70 mt-1">
                          <span>14:35</span>
                          <CheckCheck size={12} className="text-cyan-300" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Avisos de Validação (Variáveis desconhecidas ou Spintax quebrado) */}
                  {messagePreviewData?.warnings && messagePreviewData.warnings.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1 text-[11px] text-amber-200">
                      <span className="font-bold flex items-center gap-1 text-amber-300">
                        <AlertTriangle size={13} className="shrink-0" /> Avisos na Mensagem:
                      </span>
                      {messagePreviewData.warnings.map((w, idx) => (
                        <p key={idx} className="text-[10px] pl-4">{w}</p>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 italic">
                    💡 A variação exibida é uma amostra: no momento do envio real, o Spintax sorteará uma opção diferente para cada contato da fila.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary-dark px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting || (importPreview.diagnostic?.validCount === 0)}
                  className="btn-primary-dark px-5 py-2 rounded-xl text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting 
                    ? 'Criando e Importando Leads...' 
                    : (importPreview.diagnostic?.validCount === 0) 
                      ? 'Nenhum Lead Válido' 
                      : 'Criar e Importar Lista'
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detalhes dos Leads da Campanha */}
      {selectedCampaignId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">{campaignDetails?.campaign.name || 'Detalhes da Campanha'}</h2>
                <p className="text-xs text-slate-400 mt-0.5">Acompanhamento em tempo real de disparos e respostas.</p>
              </div>
              <button
                onClick={closeCampaignDetails}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {isLoadingDetails ? (
              <div className="p-5 sm:p-6 space-y-4 animate-pulse" aria-busy="true" aria-label="Carregando leads">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="glass-card p-3 rounded-xl border border-white/[0.08]">
                      <div className="h-2.5 w-16 rounded bg-white/[0.08]" />
                      <div className="h-6 w-10 rounded bg-white/[0.08] mt-2" />
                    </div>
                  ))}
                </div>
                <div className="h-9 rounded-xl bg-white/[0.06]" />
                <div className="space-y-2">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-9 rounded-lg bg-white/[0.05]" />
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
                
                {/* KPIs da Campanha */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  <div className="glass-card p-2.5 rounded-xl border border-white/[0.08]">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Pendentes</span>
                    <p className="text-base font-bold text-amber-400 mt-0.5">{campaignDetails?.counts.pending || 0}</p>
                  </div>
                  <div className="glass-card p-2.5 rounded-xl border border-white/[0.08]" title="Aguardando liberação pelo agendamento ou delay entre disparos">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Na Fila</span>
                    <p className="text-base font-bold text-indigo-400 mt-0.5">{campaignDetails?.counts.queued || 0}</p>
                  </div>
                  <div className="glass-card p-2.5 rounded-xl border border-white/[0.08]" title="Aceito pelo servidor do WhatsApp (1 tick)">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Enviados (1 ✓)</span>
                    <p className="text-base font-bold text-sky-400 mt-0.5">{campaignDetails?.counts.sent || 0}</p>
                  </div>
                  <div className="glass-card p-2.5 rounded-xl border border-white/[0.08]" title="Entregue no aparelho do contato (2 ticks cinzas)">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Entregues (2 ✓✓)</span>
                    <p className="text-base font-bold text-emerald-400 mt-0.5">{campaignDetails?.counts.delivered || 0}</p>
                  </div>
                  <div className="glass-card p-2.5 rounded-xl border border-white/[0.08]" title="Lido pelo destinatário (2 ticks azuis)">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Lidos (2 ✓✓)</span>
                    <p className="text-base font-bold text-cyan-400 mt-0.5">{campaignDetails?.counts.read || 0}</p>
                  </div>
                  <div className="glass-card p-2.5 rounded-xl border border-white/[0.08]">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Respondidos</span>
                    <p className="text-base font-bold text-purple-400 mt-0.5">{campaignDetails?.counts.replied || 0}</p>
                  </div>
                  <div className="glass-card p-2.5 rounded-xl border border-white/[0.08]">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Erros</span>
                    <p className="text-base font-bold text-red-400 mt-0.5">{campaignDetails?.counts.error || 0}</p>
                  </div>
                </div>

                {/* Alerta de leads órfãos (QUEUED sem job na fila) */}
                {queueHealth && queueHealth.queue.orphanedLeads > 0 && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>
                      <b>{queueHealth.queue.orphanedLeads} lead(s)</b> ficaram marcados como &quot;na fila&quot; mas sem job correspondente.
                      Pausar e iniciar a campanha novamente re-enfileira tudo de forma segura (sem duplicar envios).
                    </span>
                  </div>
                )}

                {/* Filtros e Busca */}
                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between pt-2">
                  <div className="relative w-full sm:w-64">
                    <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Buscar lead ou telefone..."
                      value={leadSearchTerm}
                      onChange={e => {
                        setLeadSearchTerm(e.target.value);
                        setLeadPage(1);
                      }}
                      className="w-full pl-9 pr-3 py-2 text-xs glass-input rounded-xl"
                    />
                  </div>

                  <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    {[
                      { key: 'ALL', label: 'Todos' },
                      { key: 'DELIVERED', label: '✓✓ Entregues' },
                      { key: 'READ', label: '✓✓ Lidos' },
                      { key: 'SENT', label: '✓ Enviados' },
                      { key: 'REPLIED', label: 'Respondidos' },
                      { key: 'QUEUED', label: 'Na Fila' },
                      { key: 'PENDING', label: 'Pendente' },
                      { key: 'ERROR', label: 'Erro' }
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => {
                          setLeadFilterStatus(f.key);
                          setLeadPage(1);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
                          leadFilterStatus === f.key 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tabela de Leads Dark Minimalista */}
                <div className="glass-card rounded-2xl border border-white/[0.08] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/[0.03] border-b border-white/[0.08] text-slate-400 font-semibold">
                        <tr>
                          <th className="p-3">Empresa</th>
                          <th className="p-3">Telefone</th>
                          <th className="p-3">Site / Bairro</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Envio / Detalhes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        {pagedLeads.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-500">
                              Nenhum lead encontrado com os filtros atuais.
                            </td>
                          </tr>
                        ) : (
                          pagedLeads.map(lead => (
                            <tr key={lead.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="p-3 font-semibold text-slate-200 max-w-[200px]">
                                <div className="truncate">{lead.title}</div>
                                {lead.historyInfo?.alreadySent && (
                                  <div 
                                    className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-medium"
                                    title={`Campanha anterior: ${lead.historyInfo.lastCampaignName || 'N/A'}`}
                                  >
                                    <AlertTriangle size={10} className="text-amber-400 shrink-0" />
                                    <span>
                                      Já contatado {lead.historyInfo.lastSentAt ? new Date(lead.historyInfo.lastSentAt).toLocaleDateString('pt-BR') : ''}
                                      {lead.historyInfo.sendCount > 1 ? ` (${lead.historyInfo.sendCount}x)` : ''}
                                      {lead.historyInfo.lastCampaignName ? ` · ${lead.historyInfo.lastCampaignName}` : ''}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-slate-400 font-mono whitespace-nowrap">{lead.phone}</td>
                              <td className="p-3 text-slate-400 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  {lead.website ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-medium border border-emerald-500/20">
                                      <Globe size={11} /> Site
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 text-[11px]">Sem site</span>
                                  )}
                                  {lead.neighborhood && (
                                    <span className="inline-flex items-center gap-0.5 text-slate-400 text-[11px] truncate max-w-[120px]">
                                      <MapPin size={11} className="text-slate-500" /> {lead.neighborhood}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold text-[10px] ${
                                  lead.status === 'DELIVERED'
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : lead.status === 'READ'
                                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                                    : lead.status === 'SENT'
                                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                                    : lead.status === 'PENDING'
                                    ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                    : lead.status === 'QUEUED'
                                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                    : lead.status === 'SENDING'
                                    ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                                    : lead.status === 'REPLIED'
                                    ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                }`}
                                title={
                                  lead.status === 'SENT'
                                    ? '✓ Aceito pelo servidor do WhatsApp — aguardando entrega no aparelho'
                                    : lead.status === 'DELIVERED'
                                    ? '✓✓ Entrega confirmada no aparelho do contato'
                                    : lead.status === 'READ'
                                    ? '✓✓ Leitura confirmada pelo destinatário'
                                    : undefined
                                }
                                >
                                  {lead.status === 'DELIVERED' && <CheckCheck size={11} className="text-emerald-400" />}
                                  {lead.status === 'READ' && <CheckCheck size={11} className="text-cyan-400" />}
                                  {lead.status === 'SENT' && <Check size={11} />}
                                  {lead.status === 'PENDING' && <Clock size={11} />}
                                  {lead.status === 'QUEUED' && <Clock size={11} className="animate-spin" />}
                                  {lead.status === 'SENDING' && <Clock size={11} className="animate-spin" />}
                                  {lead.status === 'REPLIED' && <MessageSquare size={11} />}
                                  {lead.status === 'ERROR' && <AlertCircle size={11} />}
                                  {lead.status === 'DELIVERED'
                                    ? 'Entregue'
                                    : lead.status === 'READ'
                                    ? 'Lido'
                                    : lead.status === 'SENT'
                                    ? 'Enviado ao WhatsApp'
                                    : lead.status === 'PENDING'
                                    ? 'Pendente'
                                    : lead.status === 'QUEUED'
                                    ? 'Na Fila'
                                    : lead.status === 'SENDING'
                                    ? 'Enviando...'
                                    : lead.status === 'REPLIED'
                                    ? 'Respondeu'
                                    : lead.status === 'ERROR'
                                    ? 'Erro'
                                    : lead.status}
                                </span>
                              </td>
                              <td
                                className="p-3 text-slate-500 text-[11px] max-w-[200px] truncate font-mono"
                                title={lead.errorMessage || undefined}
                              >
                                {lead.status === 'ERROR' ? (
                                  <span className="text-red-400/90">{lead.errorMessage || 'Falha desconhecida'}</span>
                                ) : lead.readAt ? (
                                  <span className="text-cyan-400/90">Lido: {new Date(lead.readAt).toLocaleString('pt-BR')}</span>
                                ) : lead.deliveredAt ? (
                                  <span className="text-emerald-400/90">Entregue: {new Date(lead.deliveredAt).toLocaleString('pt-BR')}</span>
                                ) : lead.sentAt ? (
                                  <span>Enviado: {new Date(lead.sentAt).toLocaleString('pt-BR')}</span>
                                ) : (
                                  lead.errorMessage || '—'
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginação da Tabela de Leads */}
                  {totalFilteredLeadsCount > LEADS_PER_PAGE && (
                    <div className="px-4 py-3 bg-white/[0.02] border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                      <span className="text-slate-400">
                        Mostrando <b className="text-slate-200">{(currentLeadPage - 1) * LEADS_PER_PAGE + 1}</b> a{' '}
                        <b className="text-slate-200">{Math.min(currentLeadPage * LEADS_PER_PAGE, totalFilteredLeadsCount)}</b> de{' '}
                        <b className="text-slate-200">{totalFilteredLeadsCount}</b> leads
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLeadPage(p => Math.max(1, p - 1))}
                          disabled={currentLeadPage <= 1}
                          className="btn-secondary-dark px-2.5 py-1 rounded-xl text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft size={13} />
                          <span>Anterior</span>
                        </button>
                        <span className="px-2 font-mono text-slate-400">
                          {currentLeadPage} / {totalLeadPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setLeadPage(p => Math.min(totalLeadPages, p + 1))}
                          disabled={currentLeadPage >= totalLeadPages}
                          className="btn-secondary-dark px-2.5 py-1 rounded-xl text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <span>Próxima</span>
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}

            <div className="p-4 border-t border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                {detailsLastSyncTime && (
                  <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${detailsSyncWarning ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                    {detailsSyncWarning ? (
                      <span className="text-amber-300 flex items-center gap-1">
                        <AlertTriangle size={12} className="text-amber-400 shrink-0" />
                        Sincronizado parcialmente às {new Date(detailsLastSyncTime).toLocaleTimeString('pt-BR')} ({detailsSyncWarning})
                      </span>
                    ) : (
                      <span>Sincronizado às {new Date(detailsLastSyncTime).toLocaleTimeString('pt-BR')}</span>
                    )}
                  </span>
                )}
                {detailsSyncError && (
                  <span className="text-red-400 flex items-center gap-1">
                    <AlertCircle size={12} className="shrink-0" />
                    {detailsSyncError}
                  </span>
                )}
              </div>
              <button
                onClick={closeCampaignDetails}
                className="btn-secondary-dark px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tutorial Apify (Dark Glassmorphism) */}
      {isTutorialOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Como Extrair Leads no Apify</h2>
                  <p className="text-xs text-slate-400">Gere sua lista de contatos do Google Maps em 3 minutos.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsTutorialOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs text-slate-300">
              
              <div className="flex gap-3.5">
                <div className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-sm">Acesse o Apify e abra o Scraper</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Acesse <a href="https://apify.com" target="_blank" rel="noreferrer" className="text-purple-400 hover:underline inline-flex items-center gap-0.5">apify.com <ExternalLink size={11} /></a> (crie conta gratuita com $5). No Store, procure por <b>&quot;Google Maps Scraper&quot;</b>.
                  </p>
                </div>
              </div>

              <div className="flex gap-3.5">
                <div className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-sm">Defina o Nicho e a Região</h3>
                  <p className="text-slate-400 leading-relaxed">
                    No campo <b>Search Strings</b>, digite os nichos desejados (ex: <i>&quot;Dentistas em Curitiba&quot;</i>).
                  </p>
                </div>
              </div>

              <div className="flex gap-3.5">
                <div className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-white text-sm">Exporte em .JSON ou .CSV</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Ao concluir, clique em <b>Export Results</b> e selecione o formato <b>JSON</b> ou <b>CSV</b>.
                  </p>
                </div>
              </div>

            </div>

            <div className="p-4 border-t border-white/[0.08] flex justify-end">
              <button 
                onClick={() => setIsTutorialOpen(false)}
                className="btn-primary-dark px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                Entendi, fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Exclusão */}
      {campaignToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-red-500/20 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Excluir Campanha</h3>
                <p className="text-xs text-slate-400 font-mono">Esta ação não pode ser desfeita.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-6 leading-relaxed">
              Tem certeza que deseja excluir a campanha <b>&quot;{campaignToDelete.name}&quot;</b>? Todos os leads associados serão removidos.
            </p>

            <div className="flex justify-end gap-2.5">
              <button 
                onClick={() => setCampaignToDelete(null)}
                className="btn-secondary-dark px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={actionLoading === campaignToDelete.id}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer shadow-lg shadow-red-600/30 disabled:opacity-60 flex items-center gap-2"
              >
                {actionLoading === campaignToDelete.id && <RefreshCw size={13} className="animate-spin" />}
                Sim, excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Assinatura Necessária / Cakto */}
      {isSubscriptionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-purple-500/30 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 relative">
            <button 
              onClick={() => setIsSubscriptionModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center shadow-lg shadow-purple-500/10">
                <Crown size={24} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Ativação de Assinatura</h3>
                <p className="text-xs text-slate-400">Acesso ilimitado à plataforma de disparos</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Disparos inteligentes com delay anti-bloqueio</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Importação direta de leads do Google Maps / Apify</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Motor de Spintax e personalização por lead</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Execução 24/7 em segundo plano na nuvem</span>
                </div>
              </div>

              <div className="text-center p-3 rounded-2xl bg-purple-500/[0.07] border border-purple-500/20">
                <span className="text-[11px] text-purple-300 font-medium block">Plano Mensal Recorrente</span>
                <div className="text-2xl font-bold text-white mt-0.5">R$ 145,99 <span className="text-xs font-normal text-slate-400">/mês</span></div>
                <span className="text-[10px] text-slate-400 block mt-1">Liberação instantânea via PIX ou Cartão</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <a
                href="https://pay.cakto.com.br/at474et_1080517"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-xs transition-all shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap size={15} />
                <span>Assinar Agora</span>
              </a>
              <button 
                onClick={() => setIsSubscriptionModalOpen(false)}
                className="w-full py-2.5 text-slate-400 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Talvez mais tarde
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Visualizar Última Mensagem Enviada no Histórico */}
      {selectedHistoryMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-white/10 rounded-3xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <MessageSquare size={16} className="text-purple-400" />
                  <span>Última Mensagem Enviada</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedHistoryMessage.companyTitle} · {formatPhone(selectedHistoryMessage.phone)}
                </p>
              </div>
              <button
                onClick={() => setSelectedHistoryMessage(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Campanha: <b className="text-slate-200">{selectedHistoryMessage.lastCampaignName || '—'}</b></span>
                <span>Enviada em: <b className="text-slate-200">{new Date(selectedHistoryMessage.lastSentAt).toLocaleString('pt-BR')}</b></span>
              </div>

              <div className="p-4 rounded-2xl bg-black/40 border border-white/[0.08] text-xs text-slate-200 whitespace-pre-wrap font-sans max-h-72 overflow-y-auto leading-relaxed select-text">
                {selectedHistoryMessage.lastMessage}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedHistoryMessage.lastMessage) {
                      navigator.clipboard.writeText(selectedHistoryMessage.lastMessage);
                      addToast('success', 'Mensagem copiada para a área de transferência!');
                    }
                  }}
                  className="btn-secondary-dark px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy size={13} />
                  <span>Copiar Mensagem</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedHistoryMessage(null)}
                  className="btn-primary-dark px-4 py-1.5 rounded-xl text-xs cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paywall Overlay Intransponível: bloqueia visualização e interação para usuários sem assinatura ativa */}
      {isHydrated && user && !isSubscriptionActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#07080B]/95 backdrop-blur-2xl animate-in fade-in select-none">
          <div className="w-full max-w-md tech-card rounded-3xl p-6 sm:p-8 border border-purple-500/40 shadow-2xl shadow-purple-950/50 bg-[#0C0E16] relative text-center">
            
            {/* Ícone de bloqueio */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/40 text-purple-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/20">
              <Lock size={26} />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full badge-purple text-xs font-semibold mb-2">
              <span>Assinatura Necessária</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Acesso Bloqueado
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
              {user.subscriptionStatus === 'PAST_DUE'
                ? 'Sua assinatura anterior venceu ou está com pagamento pendente.'
                : user.subscriptionExpiresAt && clientTime !== null && new Date(user.subscriptionExpiresAt).getTime() <= clientTime
                ? 'O período da sua assinatura mensal expirou.'
                : 'Sua conta ainda não possui uma assinatura ativa para utilizar a plataforma.'}
            </p>

            {/* Box do Plano Oficial */}
            <div className="my-5 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-left">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider block">
                    {OFFICIAL_PLAN.name}
                  </span>
                  <div className="text-2xl font-black text-white mt-0.5">
                    {OFFICIAL_PLAN.currency} {OFFICIAL_PLAN.price}{' '}
                    <span className="text-xs font-normal text-slate-400">{OFFICIAL_PLAN.period}</span>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold">
                  Liberação Imediata
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Libera conexão WhatsApp, fila inteligente com delay anti-bloqueio, spintax e execução contínua 24/7 na nuvem.
              </p>
            </div>

            {/* Feedback da verificação de pagamento */}
            {verifyPaymentFeedback && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs font-medium border text-left leading-relaxed ${
                  verifyPaymentFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : verifyPaymentFeedback.type === 'error'
                    ? 'bg-red-500/10 border-red-500/30 text-red-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}
              >
                {verifyPaymentFeedback.message}
              </div>
            )}

            {/* Botões de Ação */}
            <div className="space-y-2.5">
              <a
                href={CAKTO_CHECKOUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full btn-tech-primary py-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 cursor-pointer"
              >
                <Zap size={16} />
                <span>Ativar Assinatura</span>
              </a>

              <button
                type="button"
                onClick={handleVerifyPayment}
                disabled={verifyingPayment}
                className="w-full py-3 rounded-xl text-xs font-semibold text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-purple-500/30 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={14} className={verifyingPayment ? 'animate-spin' : ''} />
                <span>{verifyingPayment ? 'Consultando servidor...' : 'Verificar Pagamento'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  logout();
                  router.push('/login');
                }}
                className="w-full py-2 text-xs text-slate-400 hover:text-red-400 font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut size={13} />
                <span>Encerrar Sessão</span>
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] text-slate-500">
              Pagamento 100% seguro com liberação imediata via PIX ou Cartão.
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Nome da Empresa ({minhaEmpresa}) */}
      {isWorkspaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-white/10 rounded-3xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Building2 size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Nome da Empresa</h3>
                  <p className="text-[11px] text-slate-400">Variável {`{minhaEmpresa}`} nos disparos</p>
                </div>
              </div>
              <button
                onClick={() => setIsWorkspaceModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateWorkspace} className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nome da sua Empresa ou Agência
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={100}
                  value={editingWorkspaceName}
                  onChange={e => setEditingWorkspaceName(e.target.value)}
                  className="block w-full px-3.5 py-2.5 glass-input rounded-xl text-sm"
                  placeholder="Ex: Agência Alta Conversão"
                />
                <p className="text-[10px] text-slate-500 mt-1.5">Mínimo de 2 e máximo de 100 caracteres.</p>
              </div>

              <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-200 leading-relaxed">
                💡 <b>Como funciona:</b> A alteração será usada nas <b>próximas mensagens geradas</b> pela plataforma (inclusive de campanhas já em andamento). Mensagens que já foram enviadas pelo WhatsApp permanecem com o conteúdo original.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWorkspaceModalOpen(false)}
                  className="btn-secondary-dark px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingWorkspace || !editingWorkspaceName.trim()}
                  className="btn-primary-dark px-4 py-2 rounded-xl text-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingWorkspace ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                  <span>{savingWorkspace ? 'Salvando...' : 'Salvar Alterações'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
