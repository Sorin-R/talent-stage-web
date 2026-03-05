import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { apiFetch } from '../services/api';
import { toast } from '../components/Toast';
import ActionBar from '../components/ActionBar';
import Comments from '../components/Comments';
import { TALENT_TYPES } from '../types';
import type { Video, PaginatedResponse } from '../types';

interface Props {
  onNav: (page: string, data?: unknown) => void;
}

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
}

const VideoSkeleton = () => (
  <div className="home-video-skeleton snap-start">
    <div className="home-video-skeleton-lines">
      <div className="home-video-skeleton-line home-video-skeleton-line-sm" />
      <div className="home-video-skeleton-line home-video-skeleton-line-md" />
    </div>
  </div>
);

export default function Home({ onNav }: Props) {
  const {
    feedVideos,
    setFeedVideos,
    setFeedIndex,
    currentVideo,
    setCurrentVideo,
    feedMuted,
    toggleMute,
    feedCat,
    setFeedCat,
    cmtsOpen,
    setCmtsOpen,
  } = useAppStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const feedVideosRef = useRef<Video[]>(feedVideos);

  useEffect(() => {
    feedVideosRef.current = feedVideos;
  }, [feedVideos]);

  const requestWakeLock = useCallback(async () => {
    const nav = navigator as Navigator & {
      wakeLock?: { request?: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };

    try {
      if (!nav.wakeLock?.request) return;
      if (wakeLockRef.current && !wakeLockRef.current.released) return;
      wakeLockRef.current = await nav.wakeLock.request('screen');
    } catch (err) {
      console.error('WakeLock failed', err);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) return;
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    try {
      await sentinel.release();
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      if (observerRef.current) observerRef.current.disconnect();
      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

  const loadFeed = useCallback(async (
    pageNum: number,
    category = '',
    search = '',
    replace = false,
  ) => {
    if (isLoading || (!replace && pageNum > 1 && !hasMore)) return;

    setIsLoading(true);

    let url = `/videos?page=${pageNum}`;
    if (category) url += `&talent_type=${encodeURIComponent(category)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const data = await apiFetch<PaginatedResponse<Video>>(url);

    if (data.success && data.data) {
      const items = data.data.items || [];
      const shouldContinue = data.data.page < data.data.totalPages;
      setHasMore(shouldContinue);

      if (replace) {
        setFeedVideos(items);
      } else {
        const merged = [...feedVideosRef.current, ...items];
        setFeedVideos(merged);
      }
    } else {
      toast('Could not load videos');
    }

    setIsLoading(false);
  }, [hasMore, isLoading, setFeedVideos]);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    void loadFeed(1, feedCat, searchTerm, true);
  }, [feedCat, searchTerm, loadFeed]);

  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isLoading) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || !hasMore) return;
      const next = page + 1;
      setPage(next);
      void loadFeed(next, feedCat, searchTerm, false);
    });

    if (node) observerRef.current.observe(node);
  }, [feedCat, hasMore, isLoading, loadFeed, page, searchTerm]);

  const openCommentsForVideo = useCallback((video: Video) => {
    setCurrentVideo(video);
    setCmtsOpen(true);
  }, [setCurrentVideo, setCmtsOpen]);

  return (
    <div className="home-feed-scroll snap-y scrollbar-hide">
      <div className="home-cat-header">
        <div className="home-cat-tabs">
          <button
            type="button"
            onClick={() => setFeedCat('')}
            className={`home-cat-btn ${feedCat === '' ? 'active' : ''}`}
          >
            All
          </button>
          {TALENT_TYPES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFeedCat(cat)}
              className={`home-cat-btn ${feedCat === cat ? 'active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search"
          className="home-search-input"
        />
      </div>

      {feedVideos.map((video, idx) => (
        <VideoItem
          key={`${video.id}-${idx}`}
          video={video}
          index={idx}
          isMuted={feedMuted}
          onMuteToggle={toggleMute}
          onVisible={(visibleVideo, visibleIndex) => {
            setFeedIndex(visibleIndex);
            setCurrentVideo(visibleVideo);
            void requestWakeLock();
          }}
          onHidden={() => {
            void releaseWakeLock();
          }}
          onOpenComments={() => openCommentsForVideo(video)}
          onNav={onNav}
        />
      ))}

      <div ref={lastElementRef} className="home-load-more">
        {isLoading && <VideoSkeleton />}
      </div>

      {cmtsOpen && currentVideo && (
        <Comments
          videoId={currentVideo.id}
          open={cmtsOpen}
          onClose={() => setCmtsOpen(false)}
        />
      )}
    </div>
  );
}

interface VideoItemProps {
  video: Video;
  index: number;
  isMuted: boolean;
  onMuteToggle: () => void;
  onVisible: (video: Video, index: number) => void;
  onHidden: () => void;
  onOpenComments: () => void;
  onNav: (page: string, data?: unknown) => void;
}

function VideoItem({
  video,
  index,
  isMuted,
  onMuteToggle,
  onVisible,
  onHidden,
  onOpenComments,
  onNav,
}: VideoItemProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const itemObserver = new IntersectionObserver(
      ([entry]) => {
        if (!videoRef.current) return;

        if (entry.isIntersecting) {
          onVisible(video, index);
          void videoRef.current.play().catch(() => {
            // ignore autoplay block
          });
        } else {
          videoRef.current.pause();
          onHidden();
        }
      },
      { threshold: 0.7 },
    );

    itemObserver.observe(node);
    return () => itemObserver.disconnect();
  }, [index, onHidden, onVisible, video]);

  return (
    <div ref={containerRef} className="home-video-item snap-start">
      {!isReady && <VideoSkeleton />}
      <video
        ref={videoRef}
        src={video.file_url}
        loop
        playsInline
        muted={isMuted}
        onCanPlayThrough={() => setIsReady(true)}
        onLoadedData={() => setIsReady(true)}
        onClick={onMuteToggle}
        className={`home-video-player ${isReady ? 'ready' : ''}`}
      />

      <div className="home-video-meta">
        <h3>@{video.username || 'creator'}</h3>
        <p>{video.description || ''}</p>
      </div>

      <div className="home-video-actions">
        <ActionBar
          onLike={() => {}}
          onDislike={() => {}}
          onOpenComments={onOpenComments}
          onNav={onNav}
          videoVoted={false}
        />
      </div>
    </div>
  );
}
