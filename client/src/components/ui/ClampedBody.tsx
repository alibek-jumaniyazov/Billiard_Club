import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, Typography } from 'antd';
import { TOKENS } from '../../theme/tokens';
import { normalizeMessageBody } from '../../utils/format';

const { Link } = Typography;

/** URL larni matndan ajratish — havolalar bosiladigan bo'lishi uchun */
const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

interface ClampedBodyProps {
  /** Xom matn — komponent o'zi normallashtiradi */
  text: string;
  /** Yig'ilgan holatdagi satrlar soni (999 — amalda cheklanmagan) */
  rows?: number;
  /** "To'liq o'qish" yorlig'i (komponent tarjima qilmaydi) */
  expandLabel?: string;
  /** "Yig'ish" yorlig'i */
  collapseLabel?: string;
  /** O'qish qulayligi uchun satr kengligi chegarasi */
  maxWidth?: number | string;
  /** Ikkilamchi (xiraroq) matn rangi — o'qilgan xabarlar uchun */
  muted?: boolean;
  style?: CSSProperties;
}

/**
 * Uzun xabar matni uchun blok.
 *
 * NEGA ALOHIDA KOMPONENT. antd `Typography.Paragraph` ning
 * `ellipsis={{ expandable: true }}` rejimi bu vazifaga yaramaydi:
 *  - ochilgandan keyin QAYTA YIG'IB bo'lmaydi (bir tomonlama amal);
 *  - o'zining `<button>` ini render qiladi — u tashqi bosiladigan qatorga
 *    "bubble" bo'lib, tasodifan "o'qildi" belgisini qo'yib yuboradi;
 *  - JS bilan ikkilik qidiruv orqali o'lchaydi (satr chegarasida emas,
 *    belgi o'rtasida qirqadi va o'lchash paytida "miltillash" beradi).
 *
 * Bu yerda esa sof CSS `-webkit-line-clamp` + o'zining qaytariladigan
 * tugmasi. `overflowWrap: 'anywhere'` — eng muhim xossa: uzun uzluksiz
 * satr (masalan havola) qatorni kartadan tashqariga cho'zib yubormaydi.
 * `word-break: break-word` buni QILA OLMAYDI, chunki u elementning
 * min-content kengligini kamaytirmaydi.
 */
const ClampedBody = ({
  text,
  rows = 3,
  expandLabel,
  collapseLabel,
  maxWidth = '68ch',
  muted = false,
  style,
}: ClampedBodyProps) => {
  const body = useMemo(() => normalizeMessageBody(text), [text]);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Matn yoki kenglik o'zgarganda qayta o'lchanadi (yon panel yig'ilishi,
  // oyna o'lchami, til almashuvi — hammasi elementni qayta o'lchamlaydi)
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => {
      // Ochiq holatda o'lchash mumkin emas (clamp o'chirilgan) — tugma
      // ko'rinib turaveradi, aks holda foydalanuvchi yig'a olmay qoladi
      if (expanded) return;
      setCanExpand(el.scrollHeight > el.clientHeight + 1);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [body, rows, expanded]);

  const clamped = !expanded && rows > 0;

  const segments = useMemo(() => body.split(URL_PATTERN), [body]);

  return (
    <div style={{ minWidth: 0, ...style }}>
      <div
        ref={contentRef}
        style={{
          whiteSpace: 'pre-wrap',
          // Uzun uzluksiz satrlarni majburan sindiradi — gorizontal
          // scrollbarning oldini oladigan yagona xossa
          overflowWrap: 'anywhere',
          lineHeight: 1.65,
          fontSize: 13.5,
          color: muted ? TOKENS.color.text.tertiary : TOKENS.color.text.secondary,
          maxWidth,
          minWidth: 0,
          ...(clamped
            ? {
                display: '-webkit-box',
                WebkitLineClamp: rows,
                WebkitBoxOrient: 'vertical' as const,
                overflow: 'hidden',
              }
            : {}),
        }}
      >
        {segments.map((segment, index) =>
          index % 2 === 1 ? (
            <Link
              key={index}
              href={segment}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ overflowWrap: 'anywhere' }}
            >
              {segment}
            </Link>
          ) : (
            <Fragment key={index}>{segment}</Fragment>
          ),
        )}
      </div>

      {(canExpand || expanded) && expandLabel && collapseLabel && (
        <Button
          type="link"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((value) => !value);
          }}
          style={{
            padding: 0,
            height: 'auto',
            marginTop: 2,
            fontSize: 12.5,
            color: TOKENS.color.gold.base,
          }}
        >
          {expanded ? collapseLabel : expandLabel}
        </Button>
      )}
    </div>
  );
};

export default ClampedBody;
