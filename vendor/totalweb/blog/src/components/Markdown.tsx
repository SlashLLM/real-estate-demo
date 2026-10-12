import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

/**
 * Renders post markdown. AI output is untrusted: raw HTML is never rendered and the tree is sanitized
 * (heading ids are added after sanitizing so in-page anchors keep clean ids).
 */
export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  return (
    <div
      className={`max-w-none leading-7 text-fg [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-8 [&_h3]:scroll-mt-24 [&_h3]:text-xl [&_h3]:font-semibold [&_img]:my-6 [&_img]:rounded-ui [&_li]:mt-1 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_pre]:mt-4 [&_pre]:overflow-x-auto [&_pre]:rounded-ui [&_pre]:bg-surface-2 [&_pre]:p-4 [&_table]:mt-4 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, rehypeSlug]}
        components={{
          // Body headings start at H2: the page title is the only H1.
          h1: ({ node: _node, ...props }) => <h2 {...props} />,
          img: ({ node: _node, alt, ...props }) => <img {...props} alt={alt ?? ""} loading="lazy" decoding="async" />,
          a: ({ node: _node, href = "", ...props }) =>
            /^https?:\/\//.test(href) ? <a href={href} rel="noopener" target="_blank" {...props} /> : <a href={href} {...props} />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
