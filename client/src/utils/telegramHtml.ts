/* ----------------------------------------------------------------------------
 * Telegram HTML (b, i, code, a) -> React. Server matnni o'zi ekranlaydi va faqat
 * shu teglarni ishlatadi; bu yerda ham boshqa hech narsa HTML sifatida o'qilmaydi
 * (dangerouslySetInnerHTML yo'q), havola esa faqat http(s).
 * ------------------------------------------------------------------------- */
const decodeEntities = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

export interface TelegramHtmlNode {
  tag: 'root' | 'b' | 'i' | 'code' | 'a';
  href?: string;
  children: Array<TelegramHtmlNode | string>;
}

export const parseTelegramHtml = (html: string): TelegramHtmlNode => {
  const root: TelegramHtmlNode = { tag: 'root', children: [] };
  const stack: TelegramHtmlNode[] = [root];
  const re = /<(\/?)(b|i|code|a)(?:\s+href="([^"]*)")?>/g;
  let last = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m.index > last) stack[stack.length - 1].children.push(decodeEntities(html.slice(last, m.index)));
    last = re.lastIndex;
    const [, closing, tag, href] = m;
    if (closing) {
      if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop();
    } else {
      const node: TelegramHtmlNode = { tag: tag as TelegramHtmlNode['tag'], href: href ? decodeEntities(href) : undefined, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }
  }
  if (last < html.length) stack[stack.length - 1].children.push(decodeEntities(html.slice(last)));
  return root;
};
