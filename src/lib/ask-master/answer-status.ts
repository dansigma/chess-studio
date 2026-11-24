export const answerStatus = {
  analyzing: "\0status:analyzing\n",
  checking: "\0status:checking\n",
};

export function readAnswerStatus(
  text: string,
  onStatus: (status: keyof typeof answerStatus) => void,
): string {
  while (text.startsWith("\0")) {
    const end = text.indexOf("\n");
    if (end === -1) break;
    const frame = text.slice(0, end + 1);
    if (frame === answerStatus.analyzing) onStatus("analyzing");
    if (frame === answerStatus.checking) onStatus("checking");
    text = text.slice(end + 1);
  }
  return text;
}
