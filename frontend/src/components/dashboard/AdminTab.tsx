"use client";

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  ShieldCheck,
  Users,
  CreditCard,
  Crown,
  Clock,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Smartphone,
  Layers,
  Sliders,
  X,
  UserCheck,
  AlertCircle
} from 'lucide-react';

interface AdminMetrics {
  totalUsers: number;
  activeSubscribers: number;
  lifetimeAdmins: number;
  inactiveUsers: number;
  totalCampaigns: number;
  totalDispatches: number;
  connectedWhatsapps: number;
}

interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  subscriptionStatus: string;
  subscriptionExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: {
    campaignsCount: number;
    dispatchesCount: number;
    whatsappStatus: string;
    lastWhatsappUpdate: string | null;
  };
}

interface AdminTabProps {
  userRole?: string | null;
  currentUserId?: string | null;
  addToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response?: { data?: { error?: string } } }).response;
    if (res?.data?.error) return res.data.error;
  }
  return fallback;
}

export function AdminTab({ userRole, currentUserId, addToast }: AdminTabProps) {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal de edição rápida
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [editStatus, setEditStatus] = useState<string>('ACTIVE');
  const [editRole, setEditRole] = useState<string>('USER');
  const [extendDays, setExtendDays] = useState<number>(30);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Carregar métricas globais
  const fetchMetrics = useCallback(async () => {
    try {
      const res = await api.get('/admin/metrics');
      setMetrics(res.data);
    } catch (err: unknown) {
      console.error('Erro ao carregar métricas admin:', err);
      addToast('error', 'Falha ao carregar indicadores administrativos.');
    }
  }, [addToast]);

  // Carregar lista de usuários com busca e filtros
  const fetchUsers = useCallback(async (targetPage = 1, currentSearch = search, currentStatus = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', '20');
      if (currentSearch.trim()) params.set('q', currentSearch.trim());
      if (currentStatus !== 'ALL') params.set('status', currentStatus);

      const res = await api.get(`/admin/users?${params.toString()}`);
      setUsers(res.data.users || []);
      setPage(res.data.pagination?.page || 1);
      setTotalPages(res.data.pagination?.totalPages || 1);
      setTotalCount(res.data.pagination?.total || 0);
    } catch (err: unknown) {
      console.error('Erro ao carregar lista de usuários admin:', err);
      addToast('error', getErrorMessage(err, 'Erro ao carregar usuários.'));
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, addToast]);

  useEffect(() => {
    let active = true;
    if (userRole === 'ADMIN') {
      const loadInitialData = async () => {
        try {
          const [metricsRes, usersRes] = await Promise.all([
            api.get('/admin/metrics'),
            api.get('/admin/users?page=1&limit=20')
          ]);
          if (active) {
            setMetrics(metricsRes.data);
            setUsers(usersRes.data.users || []);
            setPage(usersRes.data.pagination?.page || 1);
            setTotalPages(usersRes.data.pagination?.totalPages || 1);
            setTotalCount(usersRes.data.pagination?.total || 0);
          }
        } catch (err: unknown) {
          if (active) {
            console.error('Erro ao carregar dados admin:', err);
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };
      void loadInitialData();
    }
    return () => {
      active = false;
    };
  }, [userRole]);




  // Ação rápida: Inativar / Pausar
  const handleQuickInactivate = async (targetUser: AdminUserItem) => {
    if (!window.confirm(`Deseja suspender a assinatura de ${targetUser.email}?`)) {
      return;
    }
    setActionLoading(targetUser.id);
    try {
      await api.patch(`/admin/users/${targetUser.id}/status`, {
        subscriptionStatus: 'INACTIVE'
      });
      addToast('info', `Assinatura de ${targetUser.email} suspensa.`);
      void fetchMetrics();
      void fetchUsers(page, search, statusFilter);
    } catch (err: unknown) {
      addToast('error', getErrorMessage(err, 'Erro ao suspender usuário.'));
    } finally {
      setActionLoading(null);
    }
  };

  // Excluir conta
  const handleDeleteUser = async (targetUser: AdminUserItem) => {
    if (targetUser.id === currentUserId) {
      addToast('error', 'Você não pode excluir sua própria conta de administrador.');
      return;
    }

    const confirmFirst = window.confirm(`Atenção: Deseja realmente excluir permanentemente a conta de ${targetUser.email}?`);
    if (!confirmFirst) return;

    const confirmSecond = window.confirm(`Todos os dados (campanhas, leads e histórico) de ${targetUser.email} serão apagados. Confirmar exclusão?`);
    if (!confirmSecond) return;

    setActionLoading(targetUser.id);
    try {
      await api.delete(`/admin/users/${targetUser.id}`);
      addToast('success', `Usuário ${targetUser.email} excluído com sucesso.`);
      void fetchMetrics();
      void fetchUsers(page, search, statusFilter);
    } catch (err: unknown) {
      addToast('error', getErrorMessage(err, 'Erro ao excluir usuário.'));
    } finally {
      setActionLoading(null);
    }
  };

  // Abrir modal de edição detalhada
  const openEditModal = (targetUser: AdminUserItem) => {
    setSelectedUser(targetUser);
    setEditStatus(targetUser.subscriptionStatus);
    setEditRole(targetUser.role);
    setExtendDays(0);
    setIsEditModalOpen(true);
  };

  // Salvar modal de edição
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setActionLoading(selectedUser.id);
    try {
      const payload: { subscriptionStatus?: string; role?: string; extendDays?: number } = {
        subscriptionStatus: editStatus,
        role: editRole
      };
      if (editStatus === 'ACTIVE' && extendDays > 0) {
        payload.extendDays = extendDays;
      }

      await api.patch(`/admin/users/${selectedUser.id}/status`, payload);
      addToast('success', `Dados de ${selectedUser.email} atualizados com sucesso!`);
      setIsEditModalOpen(false);
      setSelectedUser(null);
      void fetchMetrics();
      void fetchUsers(page, search, statusFilter);
    } catch (err: unknown) {
      addToast('error', getErrorMessage(err, 'Erro ao salvar alterações.'));
    } finally {
      setActionLoading(null);
    }
  };

  // Se não for admin, proteção extra
  if (userRole !== 'ADMIN') {
    return (
      <div className="glass-panel rounded-3xl p-10 border border-red-500/30 bg-red-500/[0.05] text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
          <AlertCircle size={28} />
        </div>
        <h2 className="text-xl font-bold text-white">Acesso Não Autorizado</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Esta área é estritamente restrita aos administradores do sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header Superior do Painel Admin */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Painel Administrativo</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[11px] font-bold shadow-[0_0_12px_rgba(168,85,247,0.2)]">
              <ShieldCheck size={13} className="text-purple-400" />
              Nível Master
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gestão centralizada de contas cadastradas, assinaturas e acompanhamento de infraestrutura.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void fetchMetrics();
            void fetchUsers(page, search, statusFilter);
          }}
          className="btn-secondary-dark px-3.5 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer self-start sm:self-auto hover:text-purple-300"
          title="Recarregar Dados"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-purple-400' : ''} />
          <span>Sincronizar Dados</span>
        </button>
      </div>

      {/* Grid de Cards KPIs com Design Premium */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        
        {/* Card 1: Total de Usuários */}
        <div className="glass-card rounded-2xl p-4 border border-white/[0.07] relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total de Contas</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Users size={15} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white">
            {metrics ? metrics.totalUsers : <div className="h-8 w-16 bg-white/[0.05] rounded animate-pulse" />}
          </div>
          <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
            <span>Base total cadastrada</span>
          </div>
        </div>

        {/* Card 2: Assinantes Ativos */}
        <div className="glass-card rounded-2xl p-4 border border-emerald-500/30 bg-emerald-500/[0.03] relative overflow-hidden group shadow-[0_0_20px_rgba(16,185,129,0.06)]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Assinantes Ativos</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CreditCard size={15} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-300">
            {metrics ? metrics.activeSubscribers : <div className="h-8 w-16 bg-white/[0.05] rounded animate-pulse" />}
          </div>
          <div className="text-[11px] text-emerald-500/80 mt-1.5 flex items-center gap-1">
            <CheckCircle2 size={12} />
            <span>Assinaturas regulares</span>
          </div>
        </div>

        {/* Card 3: VIPs e Admins */}
        <div className="glass-card rounded-2xl p-4 border border-purple-500/30 bg-purple-500/[0.03] relative overflow-hidden group shadow-[0_0_20px_rgba(168,85,247,0.06)]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">VIPs / Lifetime</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Crown size={15} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-purple-300">
            {metrics ? metrics.lifetimeAdmins : <div className="h-8 w-16 bg-white/[0.05] rounded animate-pulse" />}
          </div>
          <div className="text-[11px] text-purple-400/80 mt-1.5 flex items-center gap-1">
            <span>Acesso vitalício irrestrito</span>
          </div>
        </div>

        {/* Card 4: Inativos / Oportunidades */}
        <div className="glass-card rounded-2xl p-4 border border-amber-500/30 bg-amber-500/[0.03] relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">Leads Inativos</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock size={15} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-300">
            {metrics ? metrics.inactiveUsers : <div className="h-8 w-16 bg-white/[0.05] rounded animate-pulse" />}
          </div>
          <div className="text-[11px] text-amber-500/80 mt-1.5 flex items-center gap-1">
            <span>Cadastros para conversão</span>
          </div>
        </div>

      </section>

      {/* Barra de Busca e Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] border border-white/[0.08] p-3.5 rounded-2xl">
        
        {/* Campo de Pesquisa */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void fetchUsers(1, search, statusFilter);
              }
            }}
            className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/[0.08] rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50 transition-all font-sans"
          />
        </div>

        {/* Pílulas de Filtro por Status */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'Todos' },
            { id: 'ACTIVE', label: 'Ativos' },
            { id: 'LIFETIME', label: 'VIPs' },
            { id: 'INACTIVE', label: 'Inativos' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setStatusFilter(item.id);
                void fetchUsers(1, search, item.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                statusFilter === item.id
                  ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

      </div>

      {/* Tabela de Usuários */}
      <section className="glass-panel rounded-3xl border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.02] text-slate-400 font-semibold tracking-wider uppercase text-[10px]">
                <th className="p-3.5 pl-4">Usuário</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Perfil</th>
                <th className="p-3.5">Uso (Campanhas / WhatsApp)</th>
                <th className="p-3.5">Expiração</th>
                <th className="p-3.5">Cadastrado em</th>
                <th className="p-3.5 pr-4 text-center">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={18} className="animate-spin text-purple-400" />
                      <span>Consultando base de usuários no servidor...</span>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-500">
                    <div className="max-w-sm mx-auto space-y-2">
                      <Users size={32} className="text-slate-600 mx-auto mb-1" />
                      <p className="font-semibold text-slate-300">Nenhum usuário encontrado</p>
                      <p className="text-xs text-slate-500">
                        {search ? 'Tente buscar por outro termo ou limpe os filtros.' : 'Nenhum cadastro localizado no sistema.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrentAdmin = u.id === currentUserId;
                  const isActionLoading = actionLoading === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      
                      {/* Usuário (Nome + Email) */}
                      <td className="p-3.5 pl-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center font-bold text-purple-300 shrink-0 uppercase">
                            {u.name ? u.name.charAt(0) : u.email.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-white flex items-center gap-1.5 truncate">
                              <span className="truncate">{u.name}</span>
                              {isCurrentAdmin && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 font-mono">
                                  Você
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Status da Assinatura */}
                      <td className="p-3.5 whitespace-nowrap">
                        {u.subscriptionStatus === 'ACTIVE' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            Ativo
                          </span>
                        ) : u.subscriptionStatus === 'LIFETIME' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/35 text-purple-300 text-[11px] font-bold">
                            <Crown size={11} className="text-purple-400" />
                            Vitalício
                          </span>
                        ) : u.subscriptionStatus === 'PAST_DUE' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] font-semibold">
                            <AlertTriangle size={11} />
                            Vencido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-500/10 border border-slate-500/30 text-slate-400 text-[11px] font-medium">
                            <Clock size={11} />
                            Inativo
                          </span>
                        )}
                      </td>

                      {/* Perfil (Role) */}
                      <td className="p-3.5 whitespace-nowrap">
                        {u.role === 'ADMIN' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-bold">
                            <ShieldCheck size={11} />
                            ADMIN
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">
                            Cliente
                          </span>
                        )}
                      </td>

                      {/* Uso: Campanhas e WhatsApp */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-slate-300 text-[11px]" title="Campanhas criadas">
                            <Layers size={11} className="text-purple-400" />
                            <b>{u.stats?.campaignsCount || 0}</b> camp.
                          </span>

                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border ${
                            u.stats?.whatsappStatus === 'CONNECTED'
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                              : 'bg-white/[0.03] border-white/[0.06] text-slate-500'
                          }`} title="Status da sessão de WhatsApp">
                            <Smartphone size={11} />
                            {u.stats?.whatsappStatus === 'CONNECTED' ? 'Conectado' : 'Off'}
                          </span>
                        </div>
                      </td>

                      {/* Expiração */}
                      <td className="p-3.5 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        {u.subscriptionStatus === 'LIFETIME' ? (
                          <span className="text-purple-300 font-semibold">Sem expiração</span>
                        ) : u.subscriptionExpiresAt ? (
                          new Date(u.subscriptionExpiresAt).toLocaleDateString('pt-BR')
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Data de Cadastro */}
                      <td className="p-3.5 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                      </td>

                      {/* Ações */}
                      <td className="p-3.5 pr-4 whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1.5">
                          
                          {/* Botão Gerenciar Conta */}
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => openEditModal(u)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-slate-200 hover:text-white bg-white/[0.04] hover:bg-purple-600/20 border border-white/[0.08] hover:border-purple-500/40 transition-all cursor-pointer disabled:opacity-50"
                            title="Gerenciar status, perfil e dias de assinatura"
                          >
                            <Sliders size={12} className="text-purple-400" />
                            <span>Gerenciar</span>
                          </button>

                          {/* Botão Suspender (Apenas se ativo e não for o próprio admin) */}
                          {u.subscriptionStatus === 'ACTIVE' && !isCurrentAdmin && (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => void handleQuickInactivate(u)}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 border border-transparent hover:border-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                              title="Suspender acesso da conta"
                            >
                              <Clock size={14} />
                            </button>
                          )}

                          {/* Botão Excluir (Não pode excluir a si mesmo) */}
                          {!isCurrentAdmin && (
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => void handleDeleteUser(u)}
                              className="p-1.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer disabled:opacity-50"
                              title="Excluir conta do sistema"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="p-3.5 bg-white/[0.02] border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
            <div>
              Exibindo página <b className="text-white">{page}</b> de <b className="text-white">{totalPages}</b> ({totalCount} contas)
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => void fetchUsers(page - 1, search, statusFilter)}
                className="px-3 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => void fetchUsers(page + 1, search, statusFilter)}
                className="px-3 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Modal de Edição Detalhada do Usuário */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel bg-[#0B0D14]/95 border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
            
            <div className="p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                  <UserCheck size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Gerenciar Conta</h3>
                  <p className="text-xs text-slate-400 font-mono truncate max-w-[280px]">{selectedUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-5 space-y-4">
              
              {/* Status da Assinatura */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Status da Assinatura:
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-black/40 border border-white/[0.1] text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="ACTIVE" className="bg-[#0B0D14]">Ativo (ACTIVE)</option>
                  <option value="LIFETIME" className="bg-[#0B0D14]">VIP Vitalício (LIFETIME)</option>
                  <option value="INACTIVE" className="bg-[#0B0D14]">Inativo (INACTIVE)</option>
                  <option value="PAST_DUE" className="bg-[#0B0D14]">Vencido / Atrasado (PAST_DUE)</option>
                  <option value="CANCELED" className="bg-[#0B0D14]">Cancelado (CANCELED)</option>
                </select>
              </div>

              {/* Perfil de Acesso */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nível de Acesso (Role):
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  disabled={selectedUser.id === currentUserId}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-black/40 border border-white/[0.1] text-white focus:border-purple-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="USER" className="bg-[#0B0D14]">Cliente Comum (USER)</option>
                  <option value="ADMIN" className="bg-[#0B0D14]">Administrador Geral (ADMIN)</option>
                </select>
                {selectedUser.id === currentUserId && (
                  <p className="text-[10px] text-amber-400 mt-1">Você não pode alterar seu próprio nível de administrador.</p>
                )}
              </div>

              {/* Dias de Prorrogação (apenas se for ACTIVE) */}
              {editStatus === 'ACTIVE' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Adicionar dias de acesso (opcional):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={extendDays}
                      onChange={(e) => setExtendDays(Math.max(0, Number(e.target.value)))}
                      className="w-24 px-3 py-2 text-xs rounded-xl bg-black/40 border border-white/[0.1] text-white font-mono focus:border-purple-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">dias extras (deixe 0 para não alterar a data)</span>
                  </div>
                </div>
              )}

              {/* Botões de Salvar / Fechar */}
              <div className="pt-3 border-t border-white/[0.08] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading !== null}
                  className="btn-primary-dark px-5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading !== null && <RefreshCw size={13} className="animate-spin" />}
                  <span>Salvar Alterações</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
