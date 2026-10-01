"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { ApifyConnection } from "./ApifyConnection";
import { api } from "@/lib/api";
import {
  Search,
  MapPin,
  Building2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Phone,
  Star,
  Layers,
  Plus,
  Coins,
  HelpCircle,
  ExternalLink
} from "lucide-react";

interface CompanySearchResultItem {
  id: string;
  name: string;
  phone: string | null;
  website: string | null;
  hasWebsite: boolean;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  category: string | null;
  rating: number | null;
  reviewsCount: number | null;
  isUsable: boolean;
  discardReason: string | null;
  importedLeadId?: string | null;
}

interface SearchHistorySummary {
  id: string;
  query: string;
  segment: string;
  location: string;
  requestedCount: number;
  foundCount: number;
  usableCount: number;
  discardedCount: number;
  creditsConsumed: number;
  status: string;
  createdAt: string;
  _count?: { results: number };
}

interface CampaignOption {
  id: string;
  name: string;
  status: string;
}

export interface SearchCampaignSelection {
  searchId: string;
  resultIds: string[];
  query: string;
  withWebsite: number;
  withoutWebsite: number;
}

interface CompanySearchTabProps {
  campaigns: CampaignOption[];
  onOpenCreateCampaignWithLeads?: (selection: SearchCampaignSelection) => void;
  onRefreshCampaigns?: () => void;
  addToast: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function CompanySearchTab({
  campaigns,
  onOpenCreateCampaignWithLeads,
  onRefreshCampaigns,
  addToast
}: CompanySearchTabProps) {
  const [apifyReady, setApifyReady] = useState(false);
  // Parâmetros de Busca
  const [segment, setSegment] = useState("");
  const [location, setLocation] = useState("");
  const [requestedCount, setRequestedCount] = useState<number>(20);
  
  // Estados de Execução
  const [isSearching, setIsSearching] = useState(false);
  const [currentSearch, setCurrentSearch] = useState<{
    id: string;
    query: string;
    status: string;
    errorMessage?: string | null;
    foundCount: number;
    usableCount: number;
    discardedCount: number;
    creditsConsumed: number;
    results: CompanySearchResultItem[];
  } | null>(null);

  // Seleção e Adição à Campanha
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetCampaignId, setTargetCampaignId] = useState<string>("");
  const [isAdding, setIsAdding] = useState(false);

  // Histórico de Buscas
  const [history, setHistory] = useState<SearchHistorySummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get("/search");
      setHistory(res.data || []);
    } catch {
      // silencioso
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Carrega histórico inicial
  useEffect(() => {
    let isMounted = true;
    api.get("/search")
      .then(res => {
        if (isMounted) setHistory(res.data || []);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Chave estável de idempotência para o formulário atual (reutilizada em retry/duplo clique)
  const [searchIdempotencyKey, setSearchIdempotencyKey] = useState<string>(() => `search_cli_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

  const searchInFlight = useRef(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInFlight.current) return;
    if (!apifyReady) { addToast('error', 'Conecte sua conta Apify antes de buscar.'); return; }
    if (!segment.trim() || !location.trim()) {
      addToast('error', 'Informe o segmento e a localização desejada.');
      return;
    }

    searchInFlight.current = true;
    setIsSearching(true);
    setSelectedIds(new Set());

    try {
      const res = await api.post("/search", {
        segment: segment.trim(),
        location: location.trim(),
        requestedCount,
        idempotencyKey: searchIdempotencyKey
      });

      let searchData = res.data;
      if (searchData.status === 'COMPLETED') {
        searchData = (await api.get(`/search/${searchData.id}`)).data;
      }
      setCurrentSearch({ ...searchData, results: searchData.results || [] });

      // Se a busca estiver sendo processada em background pelo worker da fila
      if (searchData.status === 'PENDING' || searchData.status === 'PROCESSING') {
        addToast('info', 'Busca iniciada em segundo plano. Aguardando extração de dados...');
        const pollInterval = 2500;
        const maxAttempts = 120; // até 5 minutos; o worker continua se a espera acabar
        let attempts = 0;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          attempts++;
          try {
            const pollRes = await api.get(`/search/${searchData.id}`);
            searchData = pollRes.data;
            setCurrentSearch({ ...searchData, results: searchData.results || [] });
            if (['COMPLETED', 'FAILED', 'CANCELED'].includes(searchData.status)) {
              break;
            }
          } catch (pollErr: unknown) {
            if (pollErr instanceof Error && !axios.isAxiosError(pollErr)) {
              throw pollErr;
            }
          }
        }
      }

      setCurrentSearch({ ...searchData, results: searchData.results || [] });

      // Pré-seleciona todos os aproveitáveis automaticamente
      const usableIds = new Set<string>(
        (searchData.results || [])
          .filter((item: CompanySearchResultItem) => item.isUsable)
          .map((item: CompanySearchResultItem) => item.id)
      );
      setSelectedIds(usableIds);

      if (searchData.status === 'FAILED' || searchData.status === 'CANCELED') {
        addToast('error', searchData.errorMessage || 'A busca não foi concluída. Você pode tentar novamente.');
        setSearchIdempotencyKey(crypto.randomUUID());
      } else if (searchData.status !== 'COMPLETED') {
        addToast('info', 'A busca continua em processamento. Consulte o andamento no histórico.');
      }

      if (searchData.status === 'COMPLETED') {
        addToast(
          'success',
          `Busca concluída! ${searchData.usableCount || 0} empresas aproveitáveis encontradas (consumo na conta Apify).`
        );
        // Gera nova chave para a próxima busca distinta
        setSearchIdempotencyKey(`search_cli_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
      }
      fetchHistory();
    } catch (err: unknown) {
      let code: string | undefined;
      let msg = 'Erro ao realizar busca de empresas.';
      if (err instanceof Error && !axios.isAxiosError(err)) msg = err.message;
      if (axios.isAxiosError(err)) {
        code = err.response?.data?.code;
        msg = err.response?.data?.error || msg;
      }
      if (code === 'INSUFFICIENT_CREDITS') {
        addToast('error', 'Verifique o saldo e as permissões da sua conta Apify.');
      } else {
        addToast('error', msg);
      }
    } finally {
      searchInFlight.current = false;
      setIsSearching(false);
    }
  };

  const handleOpenHistoricalSearch = async (id: string) => {
    try {
      const res = await api.get(`/search/${id}`);
      setCurrentSearch({ ...res.data, results: res.data.results || [] });
      const usableIds = new Set<string>(
        (res.data.results || [])
          .filter((item: CompanySearchResultItem) => item.isUsable)
          .map((item: CompanySearchResultItem) => item.id)
      );
      setSelectedIds(usableIds);
    } catch {
      addToast('error', 'Falha ao carregar detalhes da busca histórica.');
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAllUsable = () => {
    if (!currentSearch) return;
    const allUsable = currentSearch.results.filter(r => r.isUsable);
    if (selectedIds.size === allUsable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allUsable.map(r => r.id)));
    }
  };

  const handleAddToCampaign = async () => {
    if (!currentSearch || !targetCampaignId) {
      addToast('error', 'Selecione uma campanha existente para adicionar as empresas.');
      return;
    }
    if (selectedIds.size === 0) {
      addToast('error', 'Selecione ao menos uma empresa para adicionar.');
      return;
    }

    setIsAdding(true);
    try {
      const res = await api.post(`/search/${currentSearch.id}/add-to-campaign`, {
        campaignId: targetCampaignId,
        companyResultIds: Array.from(selectedIds)
      });

      addToast('success', res.data.message || `${res.data.addedCount} empresas adicionadas à campanha!`);
      if (onRefreshCampaigns) onRefreshCampaigns();
    } catch (err: unknown) {
      let msg = 'Erro ao adicionar empresas à campanha.';
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        msg = err.response.data.error;
      }
      addToast('error', msg);
    } finally {
      setIsAdding(false);
    }
  };

  const handleCreateNewCampaignFromResults = () => {
    if (!currentSearch || selectedIds.size === 0) {
      addToast('error', 'Selecione ao menos uma empresa aproveitável.');
      return;
    }

    const selected = currentSearch.results.filter(r => selectedIds.has(r.id) && r.isUsable && r.phone);
    onOpenCreateCampaignWithLeads?.({
      searchId: currentSearch.id,
      resultIds: selected.map(r => r.id),
      query: currentSearch.query,
      withWebsite: selected.filter(r => r.hasWebsite).length,
      withoutWebsite: selected.filter(r => !r.hasWebsite).length,
    });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 className="text-emerald-400" size={20} />
            <span>Busca de Empresas & Prospecção Integrada</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Localize empresas com dados enriquecidos (nome, WhatsApp comercial, endereço e site) diretamente dentro da plataforma.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center gap-2 text-xs text-slate-300">
            <Coins size={14} className="text-emerald-400" />
            <span>Busca pela sua conta Apify</span>
          </div>
        </div>
      </div>

      <ApifyConnection onConnectionChange={setApifyReady} />
      {/* Formulário de Busca */}
      <div className="dash-card p-5 rounded-2xl border border-white/[0.08] space-y-4">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Segmento */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Segmento / Nicho
              </label>
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="Ex: Clínicas Odontológicas, Pizzarias"
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 dash-input rounded-xl text-xs text-white placeholder-slate-500"
                />
              </div>
            </div>

            {/* Localização */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Localização / Cidade / Bairro
              </label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="Ex: São Paulo, SP ou Moema"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 dash-input rounded-xl text-xs text-white placeholder-slate-500"
                />
              </div>
            </div>

            {/* Quantidade */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                Quantidade Solicitada
              </label>
              <div className="flex items-center gap-1.5">
                {[20, 50, 100].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setRequestedCount(qty)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      requestedCount === qty
                        ? "bg-emerald-500 text-slate-950 shadow-sm"
                        : "bg-white/[0.04] text-slate-300 border border-white/[0.08] hover:bg-white/[0.08]"
                    }`}
                  >
                    {qty}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Rodapé do Formulário: Estimativa e Botão */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <HelpCircle size={13} className="text-emerald-400 shrink-0" />
              <span>
                Até <strong>{requestedCount} empresas</strong>. A Apify cobra o consumo na sua conta, inclusive resultados descartados. <strong>Não utiliza créditos de IA.</strong>
              </span>
            </div>

            <button
              type="submit"
              disabled={isSearching || !apifyReady}
              className="px-5 py-2.5 landing-btn-emerald rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
            >
              {isSearching ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-slate-950" />
                  <span>Extraindo Empresas...</span>
                </>
              ) : (
                <>
                  <Search size={14} />
                  <span>Buscar Empresas ({requestedCount})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Exibição dos Resultados da Busca Atual */}
      {currentSearch && currentSearch.status !== 'COMPLETED' && (
        <div role="status" className="dash-card p-5 rounded-2xl border border-white/[0.08] space-y-3">
          <h3 className="font-semibold text-white">{currentSearch.query}</h3>
          <p className="text-sm text-slate-300">
            {currentSearch.status === 'FAILED'
              ? `Busca falhou. ${currentSearch.errorMessage || 'Não foi possível concluir a consulta.'}`
              : currentSearch.status === 'CANCELED'
                ? 'Busca cancelada.'
                : 'Busca em processamento. Os resultados ainda não estão prontos.'}
          </p>
          <button type="button" onClick={() => handleOpenHistoricalSearch(currentSearch.id)} className="text-sm text-emerald-400">
            Atualizar andamento
          </button>
        </div>
      )}

      {currentSearch?.status === 'COMPLETED' && (
        <div className="dash-card p-5 rounded-2xl border border-white/[0.08] space-y-4">
          {/* Métricas do Resultado */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider block">Resultado da Consulta</span>
              <h3 className="text-sm font-semibold text-white mt-0.5">
                {currentSearch.query}
              </h3>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-semibold">
                {currentSearch.usableCount} Aproveitáveis
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-400 text-xs font-mono">
                {currentSearch.discardedCount} Descartadas
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono">
                {currentSearch.creditsConsumed > 0 ? `${currentSearch.creditsConsumed} créditos (busca antiga)` : "Sem débito de créditos de IA"}
              </div>
            </div>
          </div>

          {/* Barra de Ações em Lote */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleSelectAllUsable}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
              >
                {selectedIds.size === currentSearch.results.filter(r => r.isUsable).length
                  ? "Desmarcar todas"
                  : "Selecionar todas as aptas"}
              </button>
              <span className="text-xs text-slate-400">
                <strong>{selectedIds.size}</strong> de {currentSearch.usableCount} selecionadas
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {campaigns.length > 0 && (
                <>
                  <select
                    value={targetCampaignId}
                    onChange={(e) => setTargetCampaignId(e.target.value)}
                    className="px-3 py-1.5 dash-input rounded-xl text-xs text-slate-200 bg-[#0c0d12]"
                  >
                    <option value="">Selecionar Campanha Existente...</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.status})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleAddToCampaign}
                    disabled={isAdding || !targetCampaignId || selectedIds.size === 0}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                  >
                    {isAdding ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                    <span>Adicionar à Campanha</span>
                  </button>
                </>
              )}

              {onOpenCreateCampaignWithLeads && (
                <button
                  type="button"
                  onClick={handleCreateNewCampaignFromResults}
                  disabled={selectedIds.size === 0}
                  className="px-3 py-1.5 bg-white/[0.08] hover:bg-white/[0.12] text-white font-medium rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                >
                  <Layers size={12} className="text-emerald-400" />
                  <span>Criar campanha com selecionadas</span>
                </button>
              )}
            </div>
          </div>

          {/* Tabela de Empresas Encontradas */}
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto border border-white/[0.06] rounded-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="sticky top-0 bg-[#0e1017] text-slate-400 uppercase text-[10px] tracking-wider border-b border-white/[0.08]">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        currentSearch.usableCount > 0 &&
                        selectedIds.size === currentSearch.results.filter(r => r.isUsable).length
                      }
                      onChange={toggleSelectAllUsable}
                      className="rounded accent-emerald-500"
                    />
                  </th>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">Telefone / WhatsApp</th>
                  <th className="p-3">Bairro / Endereço</th>
                  <th className="p-3">Avaliação</th>
                  <th className="p-3 text-right">Status do Lead</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {currentSearch.results.map((company) => {
                  const isChecked = selectedIds.has(company.id);
                  return (
                    <tr
                      key={company.id}
                      className={`hover:bg-white/[0.02] transition-colors ${
                        !company.isUsable ? "opacity-60 bg-red-500/[0.02]" : ""
                      }`}
                    >
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          disabled={!company.isUsable}
                          checked={isChecked}
                          onChange={() => toggleSelect(company.id)}
                          className="rounded accent-emerald-500 disabled:opacity-30"
                        />
                      </td>

                      <td className="p-3 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <span>{company.name}</span>
                          {company.hasWebsite && company.website && (
                            <a
                              href={company.website}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-500 hover:text-emerald-400"
                              title={company.website}
                            >
                              <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                        <span className={`mt-1 inline-block rounded px-2 py-0.5 text-[10px] ${company.hasWebsite ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-slate-400'}`}>
                          {company.hasWebsite ? 'Com site' : 'Sem site informado'}
                        </span>
                        {company.category && (
                          <span className="text-[10px] text-slate-500 block">{company.category}</span>
                        )}
                      </td>

                      <td className="p-3">
                        {company.phone ? (
                          <div className="flex items-center gap-1.5 font-mono text-emerald-300">
                            <Phone size={12} className="text-emerald-400" />
                            <span>{company.phone}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Sem telefone informado</span>
                        )}
                      </td>

                      <td className="p-3 text-slate-400">
                        {company.neighborhood || company.city || "—"}
                      </td>

                      <td className="p-3">
                        {company.rating ? (
                          <div className="flex items-center gap-1 text-amber-300 font-mono text-[11px]">
                            <Star size={11} className="fill-amber-400 text-amber-400" />
                            <span>{company.rating}</span>
                            {company.reviewsCount && (
                              <span className="text-slate-500 text-[10px]">({company.reviewsCount})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        {company.isUsable ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 size={11} />
                            Apto
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                            <AlertCircle size={11} />
                            {company.discardReason === 'NO_PHONE' && 'Sem telefone'}
                            {company.discardReason === 'DUPLICATE' && 'Duplicado'}
                            {company.discardReason === 'BLACKLISTED' && 'Bloqueado LGPD'}
                            {company.discardReason === 'INVALID_PHONE' && 'Número inválido'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Histórico das Últimas Buscas */}
      {history.length > 0 && (
        <div className="dash-card p-5 rounded-2xl border border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers size={13} className="text-emerald-400" />
              <span>Histórico de Buscas do Workspace</span>
            </h4>
            {loadingHistory ? (
              <RefreshCw size={12} className="animate-spin text-emerald-400" />
            ) : (
              <span className="text-[11px] text-slate-500 font-mono">{history.length} buscas</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {history.slice(0, 6).map((h) => (
              <div
                key={h.id}
                onClick={() => handleOpenHistoricalSearch(h.id)}
                className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-emerald-500/30 transition-all cursor-pointer space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white truncate max-w-[200px]">
                    {h.segment}
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                    {h.status === 'COMPLETED' ? `${h.usableCount} aptas` : h.status === 'FAILED' ? 'Falhou' : h.status === 'CANCELED' ? 'Cancelada' : 'Processando'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="truncate">{h.location}</span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {new Date(h.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
