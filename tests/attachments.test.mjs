import assert from 'node:assert/strict';
import test from 'node:test';
import { attachmentLimits, validateAttachmentInput } from '../src/attachment-validator.js';

const encode = buffer => buffer.toString('base64');
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii');
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d]),
  Buffer.from('IHDR', 'ascii'),
  Buffer.alloc(13),
  Buffer.from([0x00, 0x00, 0x00, 0x00])
]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);

test('validador reconhece assinatura real de PDF, PNG e JPEG', () => {
  const fixtures = [
    ['documento.pdf', 'application/pdf', pdf],
    ['imagem.png', 'image/png', png],
    ['foto.JPEG', 'image/jpeg', jpeg]
  ];
  for (const [fileName, mimeType, content] of fixtures) {
    const result = validateAttachmentInput({ fileName, mimeType, contentBase64:encode(content) });
    assert.equal(result.scanStatus, 'approved');
    assert.equal(result.scanProvider, 'basic-signature');
    assert.equal(result.sizeBytes, content.length);
  }
});

test('modo externo mantém arquivo pendente sem fingir aprovação antivírus', () => {
  const result = validateAttachmentInput({ fileName:'documento.pdf', mimeType:'application/pdf', contentBase64:encode(pdf), scanMode:'external' });
  assert.equal(result.scanStatus, 'pending');
  assert.equal(result.scanProvider, 'external');
  assert.equal(result.scanCheckedAt, null);
});

test('validador rejeita extensão, caminho, Base64 e assinatura divergentes', () => {
  const invalidFiles = [
    { fileName:'documento.png', mimeType:'application/pdf', contentBase64:encode(pdf) },
    { fileName:'../documento.pdf', mimeType:'application/pdf', contentBase64:encode(pdf) },
    { fileName:'documento.pdf', mimeType:'application/pdf', contentBase64:'%%%%' },
    { fileName:'documento.pdf', mimeType:'application/pdf', contentBase64:encode(jpeg) }
  ];
  for (const input of invalidFiles) {
    assert.throws(() => validateAttachmentInput(input), error => error.status === 400 && error.code === 'INVALID_ATTACHMENT');
  }
});

test('validador limita anexos a quatro megabytes', () => {
  assert.equal(attachmentLimits.maxBytes, 4 * 1024 * 1024);
  const oversized = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(attachmentLimits.maxBytes), Buffer.from('%%EOF')]);
  assert.throws(
    () => validateAttachmentInput({ fileName:'grande.pdf', mimeType:'application/pdf', contentBase64:encode(oversized) }),
    error => error.status === 400
  );
});
