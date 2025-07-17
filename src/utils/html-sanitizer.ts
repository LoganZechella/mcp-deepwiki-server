
import * as cheerio from "cheerio";

/**
 * Configuration for HTML sanitization
 */
interface SanitizeOptions {
  allowedTags?: string[];
  allowedAttributes?: { [tag: string]: string[] };
  removeComments?: boolean;
  removeScripts?: boolean;
  removeStyles?: boolean;
}

const DEFAULT_OPTIONS: SanitizeOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'a', 'strong', 'em', 'b', 'i', 'u',
    'code', 'pre',
    'blockquote',
    'div', 'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img'
  ],
  allowedAttributes: {
    'a': ['href', 'title'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    'code': ['class'],
    'pre': ['class'],
    'div': ['class'],
    'span': ['class'],
    'table': ['class'],
    'th': ['class'],
    'td': ['class']
  },
  removeComments: true,
  removeScripts: true,
  removeStyles: true
};

/**
 * Sanitize HTML content by removing dangerous elements and attributes
 */
export function sanitizeHtml(html: string, options: SanitizeOptions = {}): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const $ = cheerio.load(html);

  // Remove comments
  if (opts.removeComments) {
    $('*').contents().filter((_, node) => node.type === 'comment').remove();
  }

  // Remove scripts and styles
  if (opts.removeScripts) {
    $('script').remove();
  }
  if (opts.removeStyles) {
    $('style').remove();
  }

  // Remove navigation and other non-content elements
  $('nav, header, footer, .nav, .navbar, .navigation, .menu').remove();
  $('.sidebar, .advertisement, .ads, .social-share').remove();
  $('[class*="nav"], [class*="menu"], [class*="sidebar"]').remove();

  // Remove or clean dangerous attributes
  $('*').each((_, element) => {
    const $element = $(element);
    
    if (element.type !== 'tag') return;
    
    const tagName = element.name?.toLowerCase();

    if (!tagName) return;

    // Remove elements not in allowed list
    if (opts.allowedTags && !opts.allowedTags.includes(tagName)) {
      $element.replaceWith($element.text());
      return;
    }

    // Clean attributes
    const allowedAttrs = opts.allowedAttributes?.[tagName] || [];
    const attributes = Object.keys(element.attribs || {});

    attributes.forEach(attr => {
      if (!allowedAttrs.includes(attr)) {
        $element.removeAttr(attr);
      } else {
        // Sanitize attribute values
        const value = $element.attr(attr);
        if (value) {
          $element.attr(attr, sanitizeAttributeValue(attr, value));
        }
      }
    });
  });

  // Clean up empty elements
  $('p:empty, div:empty, span:empty').remove();

  return $.html();
}

/**
 * Sanitize attribute values
 */
function sanitizeAttributeValue(attr: string, value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  // Clean href attributes
  if (attr === 'href') {
    // Remove javascript: and data: protocols
    if (value.toLowerCase().startsWith('javascript:') || 
        value.toLowerCase().startsWith('data:') ||
        value.toLowerCase().startsWith('vbscript:')) {
      return '#';
    }
    
    // Allow relative URLs and http/https
    if (value.startsWith('/') || 
        value.startsWith('http://') || 
        value.startsWith('https://') ||
        value.startsWith('#')) {
      return value;
    }
    
    // Default to relative for other cases
    return value.startsWith('/') ? value : `/${value}`;
  }

  // Clean src attributes
  if (attr === 'src') {
    // Only allow http/https for images
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    return '';
  }

  // For other attributes, just remove potentially dangerous content
  return value
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/<script/gi, '')
    .replace(/<\/script>/gi, '');
}

/**
 * Extract clean text content from HTML
 */
export function extractTextContent(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const sanitized = sanitizeHtml(html);
  const $ = cheerio.load(sanitized);
  
  // Remove any remaining unwanted elements
  $('script, style, nav, header, footer').remove();
  
  return $.text()
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

/**
 * Convert HTML to clean markdown-like text
 */
export function htmlToCleanText(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const sanitized = sanitizeHtml(html);
  const $ = cheerio.load(sanitized);

  // Process headers
  for (let i = 1; i <= 6; i++) {
    $(`h${i}`).each((_, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      if (text) {
        const prefix = '#'.repeat(i);
        $el.replaceWith(`\n${prefix} ${text}\n\n`);
      }
    });
  }

  // Process paragraphs
  $('p').each((_, element) => {
    const $el = $(element);
    const text = $el.text().trim();
    if (text) {
      $el.replaceWith(`${text}\n\n`);
    }
  });

  // Process code blocks
  $('pre').each((_, element) => {
    const $el = $(element);
    const text = $el.text().trim();
    if (text) {
      $el.replaceWith(`\n\`\`\`\n${text}\n\`\`\`\n\n`);
    }
  });

  // Process inline code
  $('code').each((_, element) => {
    const $el = $(element);
    const text = $el.text().trim();
    if (text) {
      $el.replaceWith(`\`${text}\``);
    }
  });

  // Get clean text
  let text = $.text();
  
  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.replace(/^\s+|\s+$/g, '');
  
  return text;
}
