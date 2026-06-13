import React, { useEffect, useMemo, useState } from 'react';
import { Image, type ImageStyle, StyleProp, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '../theme/colors';
import { getVideoThumbnailCandidates } from '../services/api';

interface SmartVideoThumbnailProps {
  thumbnailUrl?: string | null;
  fileUrl?: string | null;
  imageStyle: StyleProp<ImageStyle>;
  fallbackStyle?: StyleProp<ViewStyle>;
  fallbackIconSize?: number;
}

export default function SmartVideoThumbnail({
  thumbnailUrl,
  fileUrl,
  imageStyle,
  fallbackStyle,
  fallbackIconSize = 22,
}: SmartVideoThumbnailProps) {
  const thumbnailCandidates = useMemo(
    () => getVideoThumbnailCandidates(thumbnailUrl, fileUrl),
    [thumbnailUrl, fileUrl],
  );
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(0);

  useEffect(() => {
    setActiveCandidateIndex(0);
  }, [thumbnailCandidates.join('|')]);

  const activeCandidate = thumbnailCandidates[activeCandidateIndex] || null;
  if (!activeCandidate) {
    return (
      <View style={fallbackStyle}>
        <Ionicons name="image-outline" size={fallbackIconSize} color={AppColors.textSecondary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: activeCandidate }}
      style={imageStyle}
      resizeMode="cover"
      onError={() => {
        setActiveCandidateIndex((previousValue) => {
          if (previousValue >= thumbnailCandidates.length - 1) return previousValue;
          return previousValue + 1;
        });
      }}
    />
  );
}
