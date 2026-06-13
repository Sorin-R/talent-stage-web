import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppPressable from '../../components/AppPressable';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AppColors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';

interface CreatorVideoMetrics {
  id: string;
  title: string;
  file_url: string | null;
  created_at: string;
  views: number;
  unique_views: number;
  likes: number;
  dislikes: number;
  impressions_30d: number;
  avg_watch_seconds_30d: number;
  completion_rate_30d: number;
  skip_rate_30d: number;
  engagement_rate_30d: number;
  save_rate_30d: number;
  share_rate_30d: number;
  report_rate_30d: number;
  comments_30d: number;
  quality_score: number;
  reasons?: string[];
}

interface CreatorOverview30d {
  videos_count: number;
  total_views: number;
  total_unique_views: number;
  impressions_30d: number;
  avg_watch_seconds_30d: number;
  completion_rate_30d: number;
  skip_rate_30d: number;
  engagement_rate_30d: number;
  like_dislike_ratio: number;
  reports_30d: number;
}

interface CreatorPeriodCompare7d {
  delta: {
    impressions: number;
    completion_rate: number;
    skip_rate: number;
    avg_watch_seconds: number;
    new_followers: number;
  };
}

interface CreatorTrendPoint {
  date: string;
  impressions: number;
}

interface CreatorAnalyticsPayload {
  overview_30d: CreatorOverview30d;
  videos: CreatorVideoMetrics[];
  period_compare_7d?: CreatorPeriodCompare7d;
  trend_7d?: CreatorTrendPoint[];
  top_videos?: CreatorVideoMetrics[];
  bottom_videos?: CreatorVideoMetrics[];
  action_tips?: string[];
}

type PeriodMode = '30d' | 'all';
type SortMode = 'newest' | 'oldest' | 'views' | 'likes' | 'dislikes' | 'title';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TREND_BAR_MAX_HEIGHT = 96;

export default function VideoAnalyticsScreen() {
  const navigation = useNavigation();
  const user = useAppStore((s) => s.user);

  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<CreatorAnalyticsPayload | null>(null);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('30d');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // Sort picker
  const [sortPickerOpen, setSortPickerOpen] = useState(false);
  const [pageSizePickerOpen, setPageSizePickerOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) {
        setAnalytics(null);
        return;
      }
      setLoading(true);
      const res = await apiFetch<CreatorAnalyticsPayload>('/users/' + user.id + '/creator-analytics');
      setLoading(false);
      if (!res.success || !res.data) {
        setAnalytics(null);
        return;
      }
      setAnalytics(res.data);
    };
    void load();
  }, [user?.id]);

  const fmt = (n: number) => new Intl.NumberFormat().format(Number(n || 0));
  const pct = (n: number) => `${(Number(n || 0) * 100).toFixed(1)}%`;
  const sec = (n: number) => `${Number(n || 0).toFixed(2)}s`;
  const deltaText = (n?: number) => {
    const val = Number(n || 0);
    const sign = val > 0 ? '+' : '';
    return `${sign}${(val * 100).toFixed(1)}%`;
  };
  const periodLabel = periodMode === '30d' ? '30d' : 'Full-time';
  const trendMax = Math.max(1, ...((analytics?.trend_7d || []).map((r) => Number(r.impressions || 0))));

  const totals = useMemo(() => {
    const list = analytics?.videos || [];
    let likes = 0;
    let dislikes = 0;
    for (const v of list) {
      likes += Number(v.likes || 0);
      dislikes += Number(v.dislikes || 0);
    }
    return {
      likes,
      dislikes,
      likeRatio: likes / Math.max(1, dislikes),
    };
  }, [analytics?.videos]);

  const filteredVideos = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let rows = [...(analytics?.videos || [])];

    if (needle) {
      rows = rows.filter((v) => {
        const hay = `${v.title || ''} ${v.id || ''}`.toLowerCase();
        return hay.includes(needle);
      });
    }

    rows.sort((a, b) => {
      if (sortMode === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortMode === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortMode === 'views') return Number(b.views || 0) - Number(a.views || 0);
      if (sortMode === 'likes') return Number(b.likes || 0) - Number(a.likes || 0);
      if (sortMode === 'dislikes') return Number(b.dislikes || 0) - Number(a.dislikes || 0);
      return String(a.title || '').localeCompare(String(b.title || ''));
    });

    return rows;
  }, [analytics?.videos, query, sortMode]);

  useEffect(() => {
    setPage(1);
  }, [query, sortMode, pageSize]);

  const totalItems = filteredVideos.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pagedVideos = filteredVideos.slice(start, start + pageSize);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const sortLabels: Record<SortMode, string> = {
    newest: 'Newest',
    oldest: 'Oldest',
    views: 'Most views',
    likes: 'Most likes',
    dislikes: 'Most dislikes',
    title: 'Title A-Z',
  };

  const pageSizeOptions = [25, 50, 100];

  return (
    <View style={styles.screenContainer}>
      {/* Back header */}
      <View style={styles.backRow}>
        <AppPressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={AppColors.textPrimary} />
          <Text style={styles.backText}>Back</Text>
        </AppPressable>
      </View>

      {loading && (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={AppColors.textPrimary} />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      )}

      {!loading && !analytics && (
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>Analytics unavailable right now.</Text>
        </View>
      )}

      {!loading && analytics && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Title + period toggle */}
          <View style={styles.titleRow}>
            <Text style={styles.titleText}>My Video Analytics</Text>
            <View style={styles.periodToggle}>
              <AppPressable
                onPress={() => setPeriodMode('30d')}
                style={[styles.periodButton, periodMode === '30d' && styles.periodButtonActive]}
              >
                <Text style={styles.periodButtonText}>30d</Text>
              </AppPressable>
              <AppPressable
                onPress={() => setPeriodMode('all')}
                style={[styles.periodButton, styles.periodButtonRight, periodMode === 'all' && styles.periodButtonActive]}
              >
                <Text style={styles.periodButtonText}>Full-time</Text>
              </AppPressable>
            </View>
          </View>

          {/* KPI Grid */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Videos</Text>
              <Text style={styles.kpiValue}>{fmt(analytics.overview_30d.videos_count)}</Text>
            </View>

            {periodMode === '30d' ? (
              <>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Impressions (30d)</Text>
                  <Text style={styles.kpiValue}>{fmt(analytics.overview_30d.impressions_30d)}</Text>
                  {typeof analytics.period_compare_7d?.delta?.impressions === 'number' && (
                    <Text style={[styles.kpiDelta, analytics.period_compare_7d.delta.impressions >= 0 ? styles.deltaUp : styles.deltaDown]}>
                      {deltaText(analytics.period_compare_7d.delta.impressions)} vs prev 7d
                    </Text>
                  )}
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Avg Watch (30d)</Text>
                  <Text style={styles.kpiValue}>{sec(analytics.overview_30d.avg_watch_seconds_30d)}</Text>
                  {typeof analytics.period_compare_7d?.delta?.avg_watch_seconds === 'number' && (
                    <Text style={[styles.kpiDelta, analytics.period_compare_7d.delta.avg_watch_seconds >= 0 ? styles.deltaUp : styles.deltaDown]}>
                      {deltaText(analytics.period_compare_7d.delta.avg_watch_seconds)} vs prev 7d
                    </Text>
                  )}
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Completion / Skip</Text>
                  <Text style={styles.kpiValue}>{pct(analytics.overview_30d.completion_rate_30d)} / {pct(analytics.overview_30d.skip_rate_30d)}</Text>
                  {(typeof analytics.period_compare_7d?.delta?.completion_rate === 'number'
                    && typeof analytics.period_compare_7d?.delta?.skip_rate === 'number') && (
                    <Text style={[styles.kpiDelta, styles.deltaUp]}>
                      {deltaText(analytics.period_compare_7d.delta.completion_rate)} comp / {deltaText(analytics.period_compare_7d.delta.skip_rate)} skip
                    </Text>
                  )}
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Engagement (30d)</Text>
                  <Text style={styles.kpiValue}>{pct(analytics.overview_30d.engagement_rate_30d)}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Total Views</Text>
                  <Text style={styles.kpiValue}>{fmt(analytics.overview_30d.total_views)}</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Total Unique Views</Text>
                  <Text style={styles.kpiValue}>{fmt(analytics.overview_30d.total_unique_views)}</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Total Likes / Dislikes</Text>
                  <Text style={styles.kpiValue}>{fmt(totals.likes)} / {fmt(totals.dislikes)}</Text>
                </View>
                <View style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>Like / Dislike Ratio</Text>
                  <Text style={styles.kpiValue}>
                    {analytics.overview_30d.like_dislike_ratio > 0
                      ? analytics.overview_30d.like_dislike_ratio.toFixed(2)
                      : totals.likeRatio.toFixed(2)}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* 7-Day Reach Trend */}
          <View style={styles.blockCard}>
            <Text style={styles.blockTitle}>7-Day Reach Trend</Text>
            {(analytics.trend_7d || []).length === 0 ? (
              <Text style={styles.emptyText}>No trend data yet.</Text>
            ) : (
              <View style={styles.trendChart}>
                {(analytics.trend_7d || []).map((r) => {
                  const barHeight = Math.max(8, Math.round((Number(r.impressions || 0) / trendMax) * TREND_BAR_MAX_HEIGHT));
                  return (
                    <View key={String(r.date)} style={styles.trendCol}>
                      <View style={[styles.trendBar, { height: barHeight }]} />
                      <Text style={styles.trendDay}>{String(r.date).slice(5)}</Text>
                      <Text style={styles.trendVal}>{fmt(r.impressions)}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Per Video Performance */}
          <View style={styles.blockCard}>
            <View style={styles.blockTitleRow}>
              <Text style={styles.blockTitle}>Per Video ({periodLabel})</Text>
              <Text style={styles.resultCount}>{fmt(totalItems)} result{totalItems === 1 ? '' : 's'}</Text>
            </View>

            {/* Search */}
            <TextInput
              placeholder="Find video by title or ID..."
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
            />

            {/* Sort + page size pickers */}
            <View style={styles.pickerRow}>
              <AppPressable onPress={() => setSortPickerOpen(!sortPickerOpen)} style={styles.pickerButton}>
                <Text style={styles.pickerButtonText}>{sortLabels[sortMode]}</Text>
                <Ionicons name="chevron-down" size={14} color={AppColors.textSecondary} />
              </AppPressable>
              <AppPressable onPress={() => setPageSizePickerOpen(!pageSizePickerOpen)} style={styles.pickerButton}>
                <Text style={styles.pickerButtonText}>{pageSize} / page</Text>
                <Ionicons name="chevron-down" size={14} color={AppColors.textSecondary} />
              </AppPressable>
            </View>

            {sortPickerOpen && (
              <View style={styles.dropdownContainer}>
                {(Object.keys(sortLabels) as SortMode[]).map((key) => (
                  <AppPressable
                    key={key}
                    onPress={() => { setSortMode(key); setSortPickerOpen(false); }}
                    style={[styles.dropdownItem, sortMode === key && styles.dropdownItemActive]}
                  >
                    <Text style={styles.dropdownItemText}>{sortLabels[key]}</Text>
                  </AppPressable>
                ))}
              </View>
            )}

            {pageSizePickerOpen && (
              <View style={styles.dropdownContainer}>
                {pageSizeOptions.map((size) => (
                  <AppPressable
                    key={size}
                    onPress={() => { setPageSize(size); setPageSizePickerOpen(false); }}
                    style={[styles.dropdownItem, pageSize === size && styles.dropdownItemActive]}
                  >
                    <Text style={styles.dropdownItemText}>{size} / page</Text>
                  </AppPressable>
                ))}
              </View>
            )}

            {/* Video rows */}
            {pagedVideos.length === 0 ? (
              <Text style={styles.emptyText}>No video matches your filter.</Text>
            ) : (
              pagedVideos.map((v) => {
                const ratio = Number(v.likes || 0) / Math.max(1, Number(v.dislikes || 0));
                return (
                  <View key={v.id} style={styles.videoCard}>
                    <Text style={styles.videoTitle} numberOfLines={2}>{v.title}</Text>
                    {periodMode === '30d' ? (
                      <View style={styles.metricsGrid}>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Views</Text>
                          <Text style={styles.metricValue}>{fmt(v.views)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Unique</Text>
                          <Text style={styles.metricValue}>{fmt(v.unique_views)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Impr.</Text>
                          <Text style={styles.metricValue}>{fmt(v.impressions_30d)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Avg Watch</Text>
                          <Text style={styles.metricValue}>{sec(v.avg_watch_seconds_30d)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Comp.</Text>
                          <Text style={styles.metricValue}>{pct(v.completion_rate_30d)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Skip</Text>
                          <Text style={styles.metricValue}>{pct(v.skip_rate_30d)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Engage</Text>
                          <Text style={styles.metricValue}>{pct(v.engagement_rate_30d)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Likes</Text>
                          <Text style={styles.metricValue}>{fmt(v.likes)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Dislikes</Text>
                          <Text style={styles.metricValue}>{fmt(v.dislikes)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Comments</Text>
                          <Text style={styles.metricValue}>{fmt(v.comments_30d)}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.metricsGrid}>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Views</Text>
                          <Text style={styles.metricValue}>{fmt(v.views)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Unique</Text>
                          <Text style={styles.metricValue}>{fmt(v.unique_views)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Likes</Text>
                          <Text style={styles.metricValue}>{fmt(v.likes)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Dislikes</Text>
                          <Text style={styles.metricValue}>{fmt(v.dislikes)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Like Ratio</Text>
                          <Text style={styles.metricValue}>{ratio.toFixed(2)}</Text>
                        </View>
                        <View style={styles.metricCell}>
                          <Text style={styles.metricLabel}>Created</Text>
                          <Text style={styles.metricValue}>
                            {new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </Text>
                        </View>
                      </View>
                    )}
                    {v.file_url ? (
                      <AppPressable onPress={() => Linking.openURL(v.file_url!)} style={styles.openLink}>
                        <Text style={styles.openLinkText}>Open</Text>
                        <Ionicons name="open-outline" size={14} color={AppColors.accentPrimary} />
                      </AppPressable>
                    ) : null}
                  </View>
                );
              })
            )}

            {/* Pagination */}
            <View style={styles.paginationRow}>
              <Text style={styles.pageInfo}>Page {safePage} / {totalPages}</Text>
              <View style={styles.pageButtons}>
                <AppPressable
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  style={[styles.pageButton, safePage <= 1 && styles.pageButtonDisabled]}
                >
                  <Text style={styles.pageButtonText}>Prev</Text>
                </AppPressable>
                <AppPressable
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  style={[styles.pageButton, safePage >= totalPages && styles.pageButtonDisabled]}
                >
                  <Text style={styles.pageButtonText}>Next</Text>
                </AppPressable>
              </View>
            </View>
          </View>

          {/* Top 5 / Bottom 5 */}
          <View style={styles.blockCard}>
            <Text style={styles.blockTitle}>Top 5 Videos</Text>
            {(analytics.top_videos || []).length === 0 ? (
              <Text style={styles.emptyText}>No top videos yet.</Text>
            ) : (
              (analytics.top_videos || []).map((v) => (
                <View key={v.id} style={styles.listRow}>
                  <View style={styles.listRowMain}>
                    <Text style={styles.listRowTitle} numberOfLines={1}>{v.title}</Text>
                    <Text style={styles.listRowSub}>
                      Score {Number(v.quality_score || 0).toFixed(3)} {'\u2022'} Comp {pct(v.completion_rate_30d)} {'\u2022'} Engage {pct(v.engagement_rate_30d)}
                    </Text>
                  </View>
                  {v.file_url && (
                    <AppPressable onPress={() => Linking.openURL(v.file_url!)}>
                      <Text style={styles.openLinkText}>Open</Text>
                    </AppPressable>
                  )}
                </View>
              ))
            )}
          </View>

          <View style={styles.blockCard}>
            <Text style={styles.blockTitle}>Bottom 5 Videos</Text>
            {(analytics.bottom_videos || []).length === 0 ? (
              <Text style={styles.emptyText}>No low-performing videos yet.</Text>
            ) : (
              (analytics.bottom_videos || []).map((v) => (
                <View key={v.id} style={styles.listRow}>
                  <View style={styles.listRowMain}>
                    <Text style={styles.listRowTitle} numberOfLines={1}>{v.title}</Text>
                    <Text style={styles.listRowSub}>{(v.reasons || []).join(' \u2022 ') || 'Needs review'}</Text>
                  </View>
                  {v.file_url && (
                    <AppPressable onPress={() => Linking.openURL(v.file_url!)}>
                      <Text style={styles.openLinkText}>Open</Text>
                    </AppPressable>
                  )}
                </View>
              ))
            )}
          </View>

          {/* Action Tips */}
          <View style={styles.blockCard}>
            <Text style={styles.blockTitle}>Action Tips</Text>
            {(analytics.action_tips || []).map((tip, idx) => (
              <View key={idx} style={styles.tipRow}>
                <Text style={styles.tipBullet}>{'\u2022'}</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: AppColors.backgroundPrimary,
  },
  backRow: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: AppColors.textSecondary,
    fontSize: 13,
  },
  emptyText: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
    gap: 14,
  },
  // Title + period toggle
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  titleText: {
    color: AppColors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  periodToggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: AppColors.borderSecondary,
    borderRadius: 10,
    overflow: 'hidden',
  },
  periodButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#141414',
  },
  periodButtonRight: {
    borderLeftWidth: 1,
    borderLeftColor: AppColors.borderSecondary,
  },
  periodButtonActive: {
    backgroundColor: '#2b2b2b',
  },
  periodButtonText: {
    color: AppColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderColor: AppColors.borderPrimary,
    borderRadius: 12,
    backgroundColor: AppColors.backgroundCard,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  kpiLabel: {
    color: AppColors.textSecondary,
    fontSize: 11,
    marginBottom: 3,
  },
  kpiValue: {
    color: AppColors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  kpiDelta: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
  },
  deltaUp: {
    color: AppColors.success,
  },
  deltaDown: {
    color: AppColors.danger,
  },
  // Block card
  blockCard: {
    borderWidth: 1,
    borderColor: AppColors.borderPrimary,
    borderRadius: 14,
    backgroundColor: AppColors.backgroundCard,
    padding: 14,
  },
  blockTitle: {
    color: AppColors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  blockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  resultCount: {
    color: AppColors.textMuted,
    fontSize: 12,
  },
  // Trend chart
  trendChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: TREND_BAR_MAX_HEIGHT + 36,
    paddingTop: 4,
  },
  trendCol: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  trendBar: {
    width: 22,
    backgroundColor: AppColors.accentPrimary,
    borderRadius: 4,
  },
  trendDay: {
    color: AppColors.textSecondary,
    fontSize: 9,
  },
  trendVal: {
    color: AppColors.textMuted,
    fontSize: 9,
  },
  // Search + pickers
  searchInput: {
    backgroundColor: AppColors.backgroundInput,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: AppColors.textPrimary,
    fontSize: 13,
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  pickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppColors.backgroundInput,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  pickerButtonText: {
    color: AppColors.textPrimary,
    fontSize: 13,
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: AppColors.borderSecondary,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    marginBottom: 10,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  dropdownItemText: {
    color: AppColors.textPrimary,
    fontSize: 13,
  },
  // Video performance cards
  videoCard: {
    borderWidth: 1,
    borderColor: AppColors.borderPrimary,
    borderRadius: 10,
    backgroundColor: AppColors.backgroundPrimary,
    padding: 12,
    marginBottom: 8,
  },
  videoTitle: {
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metricCell: {
    minWidth: 70,
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  metricLabel: {
    color: AppColors.textMuted,
    fontSize: 10,
    marginBottom: 2,
  },
  metricValue: {
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  openLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  openLinkText: {
    color: AppColors.accentPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  // Pagination
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  pageInfo: {
    color: AppColors.textMuted,
    fontSize: 12,
  },
  pageButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  pageButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: '#242424',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pageButtonDisabled: {
    backgroundColor: '#1c1c1c',
    opacity: 0.5,
  },
  pageButtonText: {
    color: AppColors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  // Top/Bottom list rows
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  listRowMain: {
    flex: 1,
    minWidth: 0,
  },
  listRowTitle: {
    color: AppColors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  listRowSub: {
    color: AppColors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  // Tips
  tipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  tipBullet: {
    color: AppColors.textSecondary,
    fontSize: 14,
  },
  tipText: {
    color: AppColors.textPrimary,
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },
});
