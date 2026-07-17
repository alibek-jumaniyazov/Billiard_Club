import { Image, Skeleton } from 'antd';
import { TOKENS } from '../../theme/tokens';
import { useAttachmentUrls } from '../../hooks/useAttachmentUrls';

interface AttachmentThumbsProps {
  /** Yuklamalar egasi (feedback.id) */
  ownerId: number;
  /** Yuklamalar soni */
  count: number;
  /** Sahifaga mos API metod: (index) => Promise<Blob> */
  fetcher: (index: number) => Promise<Blob>;
  alt: string;
  size?: number;
}

/**
 * Biriktirilgan rasmlar qatori — autentifikatsiyalangan blob orqali
 * (statik /uploads tarqatilmaydi). Yuklanayotganda skeleton ko'rsatadi,
 * bosilganda antd Image preview guruhida ochiladi.
 */
const AttachmentThumbs = ({ ownerId, count, fetcher, alt, size = 48 }: AttachmentThumbsProps) => {
  const urls = useAttachmentUrls(ownerId, count, fetcher);
  if (count <= 0) return null;

  return (
    <Image.PreviewGroup>
      {Array.from({ length: count }, (_, index) => {
        const url = urls[index];
        return url ? (
          <Image
            key={index}
            src={url}
            alt={`${alt} ${index + 1}`}
            width={size}
            height={size}
            style={{
              objectFit: 'cover',
              borderRadius: 6,
              border: `1px solid ${TOKENS.color.border.base}`,
            }}
          />
        ) : (
          <Skeleton.Image key={index} active style={{ width: size, height: size }} />
        );
      })}
    </Image.PreviewGroup>
  );
};

export default AttachmentThumbs;
