const maxBytes = 4 * 1024 * 1024;

const signatures = {
  'application/pdf': {
    extensions:new Set(['.pdf']),
    valid:buffer => buffer.subarray(0, 5).toString('ascii') === '%PDF-' && buffer.subarray(Math.max(0, buffer.length - 2048)).includes(Buffer.from('%%EOF'))
  },
  'image/png': {
    extensions:new Set(['.png']),
    valid:buffer => buffer.length >= 24
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      && buffer.subarray(12, 16).toString('ascii') === 'IHDR'
  },
  'image/jpeg': {
    extensions:new Set(['.jpg', '.jpeg']),
    valid:buffer => buffer.length >= 4
      && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9
  }
};

const invalid = message => Object.assign(new Error(message), { status:400, code:'INVALID_ATTACHMENT' });

const safeFileName = value => {
  const name = String(value || '').normalize('NFKC').trim();
  if (!name || name.length > 160 || /[\\/\0-\x1f\x7f]/.test(name) || name === '.' || name === '..') {
    throw invalid('Nome de arquivo inválido.');
  }
  return name;
};

const strictBase64 = value => {
  const encoded = String(value || '').trim();
  if (!encoded || encoded.length > Math.ceil(maxBytes / 3) * 4 + 4 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw invalid('Conteúdo do anexo inválido.');
  }
  const content = Buffer.from(encoded, 'base64');
  if (!content.length || content.length > maxBytes || content.toString('base64') !== encoded) {
    throw invalid('O anexo deve ter no máximo 4 MB.');
  }
  return content;
};

export const validateAttachmentInput = ({ fileName, mimeType, contentBase64, scanMode = 'basic' }) => {
  const name = safeFileName(fileName);
  const mime = String(mimeType || '').trim().toLowerCase();
  const specification = signatures[mime];
  if (!specification) throw invalid('Envie somente PDF, PNG ou JPG válidos.');
  const extensionIndex = name.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? name.slice(extensionIndex).toLowerCase() : '';
  if (!specification.extensions.has(extension)) throw invalid('A extensão do arquivo não corresponde ao tipo informado.');
  const content = strictBase64(contentBase64);
  if (!specification.valid(content)) throw invalid('A assinatura interna do arquivo não corresponde ao tipo informado.');
  const externalScan = scanMode === 'external';
  return {
    fileName:name,
    mimeType:mime,
    content,
    sizeBytes:content.length,
    scanStatus:externalScan ? 'pending' : 'approved',
    scanProvider:externalScan ? 'external' : 'basic-signature',
    scanCheckedAt:externalScan ? null : new Date()
  };
};

export const attachmentLimits = { maxBytes, mimeTypes:Object.freeze(Object.keys(signatures)) };
