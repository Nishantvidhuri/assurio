import Image from 'next/image';

export default function Brand() {
  return (
    <div className="brand">
      <Image
        className="brand-mark"
        src="/logo-mark.png"
        alt=""
        width={32}
        height={32}
        priority
        aria-hidden="true"
      />
      <span className="brand-name">Recrify</span>
    </div>
  );
}
