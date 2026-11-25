import React, { useId } from 'react';

/**
 * 随心看 品牌 Logo（方案 B：暗黑电影风拉丝钢盾形徽章 + 古铜斜切面播放三角）
 * - 与 App 图标 build/icon.svg 一致的内联 SVG，不依赖外部文件
 * - 按显示尺寸自动切换三档细节（与 icns 小尺寸策略一致），保证小尺寸清晰可辨
 * - 每个实例用 useId 生成独立的渐变/滤镜 id，避免多实例串色
 */
const SQUIRCLE = 'M924.0,512.0 L923.9,608.0 L923.8,638.6 L923.5,660.9 L923.1,679.0 L922.6,694.5 L922.0,708.2 L921.2,720.5 L920.4,731.8 L919.4,742.2 L918.3,751.9 L917.1,761.0 L915.8,769.6 L914.4,777.6 L912.8,785.3 L911.2,792.6 L909.4,799.5 L907.5,806.1 L905.4,812.4 L903.3,818.5 L901.0,824.2 L898.5,829.8 L896.0,835.1 L893.3,840.2 L890.5,845.1 L887.6,849.8 L884.5,854.3 L881.2,858.7 L877.9,862.8 L874.3,866.8 L870.7,870.7 L866.8,874.3 L862.8,877.9 L858.7,881.2 L854.3,884.5 L849.8,887.6 L845.1,890.5 L840.2,893.3 L835.1,896.0 L829.8,898.5 L824.2,901.0 L818.5,903.3 L812.4,905.4 L806.1,907.5 L799.5,909.4 L792.6,911.2 L785.3,912.8 L777.6,914.4 L769.6,915.8 L761.0,917.1 L751.9,918.3 L742.2,919.4 L731.8,920.4 L720.5,921.2 L708.2,922.0 L694.5,922.6 L679.0,923.1 L660.9,923.5 L638.6,923.8 L608.0,923.9 L512.0,924.0 L416.0,923.9 L385.4,923.8 L363.1,923.5 L345.0,923.1 L329.5,922.6 L315.8,922.0 L303.5,921.2 L292.2,920.4 L281.8,919.4 L272.1,918.3 L263.0,917.1 L254.4,915.8 L246.4,914.4 L238.7,912.8 L231.4,911.2 L224.5,909.4 L217.9,907.5 L211.6,905.4 L205.5,903.3 L199.8,901.0 L194.2,898.5 L188.9,896.0 L183.8,893.3 L178.9,890.5 L174.2,887.6 L169.7,884.5 L165.3,881.2 L161.2,877.9 L157.2,874.3 L153.3,870.7 L149.7,866.8 L146.1,862.8 L142.8,858.7 L139.5,854.3 L136.4,849.8 L133.5,845.1 L130.7,840.2 L128.0,835.1 L125.5,829.8 L123.0,824.2 L120.7,818.5 L118.6,812.4 L116.5,806.1 L114.6,799.5 L112.8,792.6 L111.2,785.3 L109.6,777.6 L108.2,769.6 L106.9,761.0 L105.7,751.9 L104.6,742.2 L103.6,731.8 L102.8,720.5 L102.0,708.2 L101.4,694.5 L100.9,679.0 L100.5,660.9 L100.2,638.6 L100.1,608.0 L100.0,512.0 L100.1,416.0 L100.2,385.4 L100.5,363.1 L100.9,345.0 L101.4,329.5 L102.0,315.8 L102.8,303.5 L103.6,292.2 L104.6,281.8 L105.7,272.1 L106.9,263.0 L108.2,254.4 L109.6,246.4 L111.2,238.7 L112.8,231.4 L114.6,224.5 L116.5,217.9 L118.6,211.6 L120.7,205.5 L123.0,199.8 L125.5,194.2 L128.0,188.9 L130.7,183.8 L133.5,178.9 L136.4,174.2 L139.5,169.7 L142.8,165.3 L146.1,161.2 L149.7,157.2 L153.3,153.3 L157.2,149.7 L161.2,146.1 L165.3,142.8 L169.7,139.5 L174.2,136.4 L178.9,133.5 L183.8,130.7 L188.9,128.0 L194.2,125.5 L199.8,123.0 L205.5,120.7 L211.6,118.6 L217.9,116.5 L224.5,114.6 L231.4,112.8 L238.7,111.2 L246.4,109.6 L254.4,108.2 L263.0,106.9 L272.1,105.7 L281.8,104.6 L292.2,103.6 L303.5,102.8 L315.8,102.0 L329.5,101.4 L345.0,100.9 L363.1,100.5 L385.4,100.2 L416.0,100.1 L512.0,100.0 L608.0,100.1 L638.6,100.2 L660.9,100.5 L679.0,100.9 L694.5,101.4 L708.2,102.0 L720.5,102.8 L731.8,103.6 L742.2,104.6 L751.9,105.7 L761.0,106.9 L769.6,108.2 L777.6,109.6 L785.3,111.2 L792.6,112.8 L799.5,114.6 L806.1,116.5 L812.4,118.6 L818.5,120.7 L824.2,123.0 L829.8,125.5 L835.1,128.0 L840.2,130.7 L845.1,133.5 L849.8,136.4 L854.3,139.5 L858.7,142.8 L862.8,146.1 L866.8,149.7 L870.7,153.3 L874.3,157.2 L877.9,161.2 L881.2,165.3 L884.5,169.7 L887.6,174.2 L890.5,178.9 L893.3,183.8 L896.0,188.9 L898.5,194.2 L901.0,199.8 L903.3,205.5 L905.4,211.6 L907.5,217.9 L909.4,224.5 L911.2,231.4 L912.8,238.7 L914.4,246.4 L915.8,254.4 L917.1,263.0 L918.3,272.1 L919.4,281.8 L920.4,292.2 L921.2,303.5 L922.0,315.8 L922.6,329.5 L923.1,345.0 L923.5,363.1 L923.8,385.4 L923.9,416.0Z';

/** 尺寸阈值：≤ TINY_MAX 用极简版，≤ SIMPLE_MAX 用简化版，其余用完整版 */
const TINY_MAX = 32;
const SIMPLE_MAX = 72;

/** 极简版：大盾、亮钢边、亮古铜实心三角（≤ 32px） */
function TinyArt({ id }: { id: string }): JSX.Element {
  return (
    <>
      <defs>
        <clipPath id={`clip${id}`}>
          <path d={SQUIRCLE} />
        </clipPath>

<linearGradient id={`bg${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#262d35"/><stop offset="1" stopColor="#0a0c0f"/></linearGradient>
<linearGradient id={`steel${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f0f5f8"/><stop offset=".5" stopColor="#aab4bd"/><stop offset="1" stopColor="#6b7680"/></linearGradient>
<linearGradient id={`gold${id}`} x1="0" y1="0" x2="0.5" y2="1"><stop offset="0" stopColor="#f3d79e"/><stop offset=".55" stopColor="#cfa766"/><stop offset="1" stopColor="#8a6534"/></linearGradient>
      </defs>
      <g clipPath={`url(#clip${id})`}>
<rect x="100" y="100" width="824" height="824" fill={`url(#bg${id})`}/>
<path d="M512.0 134.8 L837.6 271.2 L795.8 654.0 L512.0 893.8 L228.2 654.0 L186.4 271.2Z" fill={`url(#steel${id})`}/>
<path d="M512.0 234.4 L748.8 333.6 L718.4 612.0 L512.0 786.4 L305.6 612.0 L275.2 333.6Z" fill="#030405"/>
<path d="M420.0 348.0 L714.0 512.0 L420.0 676.0Z" fill={`url(#gold${id})`} stroke="#f3d79e" strokeWidth="6" strokeLinejoin="miter"/>
      </g>
    </>
  );
}

/** 简化版：去掉粉尘/烟雾/颗粒，钢边加粗、三角放大（33–72px） */
function SimpleArt({ id }: { id: string }): JSX.Element {
  return (
    <>
      <defs>
        <clipPath id={`clip${id}`}>
          <path d={SQUIRCLE} />
        </clipPath>

<linearGradient id={`bg${id}`} x1="0.3" y1="0" x2="0.7" y2="1"><stop offset="0" stopColor="#1d232a"/><stop offset=".5" stopColor="#11151a"/><stop offset="1" stopColor="#07080a"/></linearGradient>
<radialGradient id={`vig${id}`} cx=".5" cy=".42" r=".72"><stop offset=".45" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".85"/></radialGradient>
<linearGradient id={`beam${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bfe0ee" stopOpacity=".55"/><stop offset=".55" stopColor="#7fa9bd" stopOpacity=".12"/><stop offset="1" stopColor="#7fa9bd" stopOpacity="0"/></linearGradient>
<radialGradient id={`ember${id}`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffb46a" stopOpacity=".95"/><stop offset=".35" stopColor="#ff7a2e" stopOpacity=".35"/><stop offset="1" stopColor="#ff7a2e" stopOpacity="0"/></radialGradient>
<linearGradient id={`bf_face${id}`} x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stopColor="#cfa96e"/><stop offset=".35" stopColor="#a07d48"/><stop offset=".7" stopColor="#5a4426"/><stop offset="1" stopColor="#2e2312"/></linearGradient>
<linearGradient id={`bf_top${id}`} x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stopColor="#e6cf9e"/><stop offset="1" stopColor="#9c7a46"/></linearGradient>
<linearGradient id={`bf_left${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a5e34"/><stop offset="1" stopColor="#4a381c"/></linearGradient>
<linearGradient id={`bf_bot${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#120d06"/><stop offset="1" stopColor="#2a1f10"/></linearGradient>
<filter id={`brush${id}`} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.45"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id={`smoke${id}`} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="4" seed="7"/><feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.68  0 0 0 0 0.75  0 0 0 0.55 -0.12"/></filter>
<filter id={`grain${id}`} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch" seed="11"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/></filter>
<filter id={`soft${id}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
<filter id={`cast${id}`} x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="26" stdDeviation="22" floodColor="#000" floodOpacity=".85"/></filter>
<filter id={`rim${id}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
<linearGradient id={`steel${id}`} x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stopColor="#dde5ea"/><stop offset=".28" stopColor="#7a858f"/><stop offset=".62" stopColor="#343b42"/><stop offset="1" stopColor="#14181c"/></linearGradient>
<linearGradient id={`steel2${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c0f12"/><stop offset=".5" stopColor="#3a434b"/><stop offset="1" stopColor="#8d99a3"/></linearGradient>
<radialGradient id={`inner${id}`} cx=".5" cy=".3" r=".8"><stop offset="0" stopColor="#1b2128"/><stop offset="1" stopColor="#050607"/></radialGradient>
<linearGradient id={`warmbot${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff8a3d" stopOpacity="0"/><stop offset="1" stopColor="#ff8a3d" stopOpacity=".3"/></linearGradient>
      </defs>
      <g clipPath={`url(#clip${id})`}><rect x="100" y="100" width="824" height="824" fill={`url(#bg${id})`}/><path d="M440 60 L584 60 L800 960 L224 960 Z" fill={`url(#beam${id})`} filter={`url(#soft${id})`} opacity=".6"/><rect x="100" y="100" width="824" height="824" fill={`url(#vig${id})`} opacity=".7"/>
<g filter={`url(#cast${id})`}><path d="M512.0 168.0 L808.0 292.0 L770.0 640.0 L512.0 858.0 L254.0 640.0 L216.0 292.0Z" fill="#000"/></g>
<path d="M512.0 168.0 L808.0 292.0 L770.0 640.0 L512.0 858.0 L254.0 640.0 L216.0 292.0Z" fill={`url(#steel${id})`}/>
<path d="M512.0 197.9 L781.4 310.7 L746.8 627.4 L512.0 825.8 L277.2 627.4 L242.6 310.7Z" fill={`url(#steel2${id})`}/>
<path d="M512.0 241.0 L742.9 337.8 L713.2 609.2 L512.0 779.2 L310.8 609.2 L281.1 337.8Z" fill={`url(#inner${id})`}/>
<path d="M512.0 241.0 L742.9 337.8 L713.2 609.2 L512.0 779.2 L310.8 609.2 L281.1 337.8Z" fill="none" stroke="#000" strokeWidth="8" opacity=".8"/>
<path d="M216 292 L512 168 L808 292" fill="none" stroke="#f2f8fb" strokeWidth="6" strokeLinejoin="miter" opacity=".85"/>
<path d="M424.0 350.0 L708.0 508.0 L424.0 666.0Z" fill="none" stroke="#cfe6f0" strokeWidth="10" opacity="0.6" filter={`url(#rim${id})`}/>
<path d="M424.0 350.0 L708.0 508.0 L651.2 508.0 L452.4 397.4Z" fill={`url(#bf_top${id})`}/>
<path d="M424.0 666.0 L424.0 350.0 L452.4 397.4 L452.4 618.6Z" fill={`url(#bf_left${id})`}/>
<path d="M708.0 508.0 L424.0 666.0 L452.4 618.6 L651.2 508.0Z" fill={`url(#bf_bot${id})`}/>
<path d="M452.4 397.4 L651.2 508.0 L452.4 618.6Z" fill={`url(#bf_face${id})`}/>
<path d="M452.4 397.4 L651.2 508.0 L452.4 618.6Z" fill="#000" filter={`url(#brush${id})`} opacity=".35"/>
<path d="M424 350 L708 508" stroke="#e8f2f6" strokeWidth="3" opacity=".75"/>
<path d="M452.4 397.4 L651.2 508.0" stroke="#fff0d0" strokeWidth="2" opacity=".35"/>
<path d="M708.0 508.0 L424.0 666.0 L452.4 618.6 L651.2 508.0Z" fill={`url(#warmbot${id})`}/>
<path d="M424 666 L708 508" stroke="#ff9a55" strokeWidth="2.5" opacity=".45"/>
<circle cx="704" cy="508" r="30" fill={`url(#ember${id})`} opacity=".85"/>
      </g>
    </>
  );
}

/** 完整版：烟雾、体积光、粉尘、拉丝纹理与胶片颗粒（> 72px） */
function FullArt({ id }: { id: string }): JSX.Element {
  return (
    <>
      <defs>
        <clipPath id={`clip${id}`}>
          <path d={SQUIRCLE} />
        </clipPath>

<linearGradient id={`bg${id}`} x1="0.3" y1="0" x2="0.7" y2="1"><stop offset="0" stopColor="#1d232a"/><stop offset=".5" stopColor="#11151a"/><stop offset="1" stopColor="#07080a"/></linearGradient>
<radialGradient id={`vig${id}`} cx=".5" cy=".42" r=".72"><stop offset=".45" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".85"/></radialGradient>
<linearGradient id={`beam${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bfe0ee" stopOpacity=".55"/><stop offset=".55" stopColor="#7fa9bd" stopOpacity=".12"/><stop offset="1" stopColor="#7fa9bd" stopOpacity="0"/></linearGradient>
<radialGradient id={`ember${id}`} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffb46a" stopOpacity=".95"/><stop offset=".35" stopColor="#ff7a2e" stopOpacity=".35"/><stop offset="1" stopColor="#ff7a2e" stopOpacity="0"/></radialGradient>
<linearGradient id={`bf_face${id}`} x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stopColor="#cfa96e"/><stop offset=".35" stopColor="#a07d48"/><stop offset=".7" stopColor="#5a4426"/><stop offset="1" stopColor="#2e2312"/></linearGradient>
<linearGradient id={`bf_top${id}`} x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stopColor="#e6cf9e"/><stop offset="1" stopColor="#9c7a46"/></linearGradient>
<linearGradient id={`bf_left${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7a5e34"/><stop offset="1" stopColor="#4a381c"/></linearGradient>
<linearGradient id={`bf_bot${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#120d06"/><stop offset="1" stopColor="#2a1f10"/></linearGradient>
<filter id={`brush${id}`} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.45"/><feComposite in2="SourceGraphic" operator="in"/></filter>
<filter id={`smoke${id}`} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="4" seed="7"/><feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.68  0 0 0 0 0.75  0 0 0 0.55 -0.12"/></filter>
<filter id={`grain${id}`} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch" seed="11"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/></filter>
<filter id={`soft${id}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
<filter id={`cast${id}`} x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="26" stdDeviation="22" floodColor="#000" floodOpacity=".85"/></filter>
<filter id={`rim${id}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
<linearGradient id={`steel${id}`} x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stopColor="#dde5ea"/><stop offset=".28" stopColor="#7a858f"/><stop offset=".62" stopColor="#343b42"/><stop offset="1" stopColor="#14181c"/></linearGradient>
<linearGradient id={`steel2${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c0f12"/><stop offset=".5" stopColor="#3a434b"/><stop offset="1" stopColor="#8d99a3"/></linearGradient>
<radialGradient id={`inner${id}`} cx=".5" cy=".3" r=".8"><stop offset="0" stopColor="#1b2128"/><stop offset="1" stopColor="#050607"/></radialGradient>
<linearGradient id={`warmbot${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ff8a3d" stopOpacity="0"/><stop offset="1" stopColor="#ff8a3d" stopOpacity=".3"/></linearGradient>
      </defs>
      <g clipPath={`url(#clip${id})`}>
<rect x="100" y="100" width="824" height="824" fill={`url(#bg${id})`}/>
<rect x="100" y="100" width="824" height="824" filter={`url(#smoke${id})`} opacity=".35"/>
<path d="M440 60 L584 60 L800 960 L224 960 Z" fill={`url(#beam${id})`} filter={`url(#soft${id})`} opacity=".8"/>
<rect x="100" y="100" width="824" height="824" fill={`url(#vig${id})`}/><g><circle cx="429" cy="162" r="2" fill="#d8ecf5" opacity="0.32"/><circle cx="419" cy="136" r="2.6" fill="#d8ecf5" opacity="0.47"/><circle cx="585" cy="264" r="1.6" fill="#d8ecf5" opacity="0.33"/><circle cx="575" cy="185" r="1.6" fill="#d8ecf5" opacity="0.24"/><circle cx="373" cy="290" r="2.6" fill="#d8ecf5" opacity="0.43"/><circle cx="428" cy="264" r="2" fill="#d8ecf5" opacity="0.25"/><circle cx="643" cy="276" r="2" fill="#d8ecf5" opacity="0.18"/><circle cx="555" cy="229" r="2.6" fill="#d8ecf5" opacity="0.24"/><circle cx="466" cy="165" r="2.6" fill="#d8ecf5" opacity="0.44"/><circle cx="474" cy="121" r="2.6" fill="#d8ecf5" opacity="0.46"/><circle cx="514" cy="273" r="2" fill="#d8ecf5" opacity="0.30"/><circle cx="501" cy="172" r="1.6" fill="#d8ecf5" opacity="0.26"/><circle cx="386" cy="266" r="1.6" fill="#d8ecf5" opacity="0.31"/><circle cx="518" cy="300" r="2.6" fill="#d8ecf5" opacity="0.31"/><circle cx="623" cy="182" r="1.6" fill="#d8ecf5" opacity="0.17"/><circle cx="551" cy="284" r="2" fill="#d8ecf5" opacity="0.25"/><circle cx="567" cy="184" r="2" fill="#d8ecf5" opacity="0.37"/><circle cx="476" cy="156" r="1.6" fill="#d8ecf5" opacity="0.40"/><circle cx="530" cy="170" r="1.6" fill="#d8ecf5" opacity="0.19"/><circle cx="451" cy="288" r="1.6" fill="#d8ecf5" opacity="0.16"/><circle cx="616" cy="246" r="2" fill="#d8ecf5" opacity="0.41"/><circle cx="370" cy="293" r="2" fill="#d8ecf5" opacity="0.26"/></g>
<g filter={`url(#cast${id})`}><path d="M512.0 168.0 L808.0 292.0 L770.0 640.0 L512.0 858.0 L254.0 640.0 L216.0 292.0Z" fill="#000"/></g>
<path d="M512.0 168.0 L808.0 292.0 L770.0 640.0 L512.0 858.0 L254.0 640.0 L216.0 292.0Z" fill={`url(#steel${id})`}/><path d="M512.0 168.0 L808.0 292.0 L770.0 640.0 L512.0 858.0 L254.0 640.0 L216.0 292.0Z" fill="#000" filter={`url(#brush${id})`} opacity=".4"/>
<path d="M512.0 186.3 L791.7 303.4 L755.8 632.3 L512.0 838.3 L268.2 632.3 L232.3 303.4Z" fill={`url(#steel2${id})`}/>
<path d="M512.0 217.8 L763.6 323.2 L731.3 619.0 L512.0 804.3 L292.7 619.0 L260.4 323.2Z" fill={`url(#inner${id})`}/>
<path d="M512.0 217.8 L763.6 323.2 L731.3 619.0 L512.0 804.3 L292.7 619.0 L260.4 323.2Z" fill="none" stroke="#000" strokeWidth="5" opacity=".8"/>
<path d="M216 292 L512 168 L808 292" fill="none" stroke="#f2f8fb" strokeWidth="4" strokeLinejoin="miter" opacity=".85"/>
<path d="M436.0 366.0 L680.0 506.0 L436.0 646.0Z" fill="none" stroke="#cfe6f0" strokeWidth="10" opacity="0.45" filter={`url(#rim${id})`}/>
<path d="M436.0 366.0 L680.0 506.0 L631.2 506.0 L460.4 408.0Z" fill={`url(#bf_top${id})`}/>
<path d="M436.0 646.0 L436.0 366.0 L460.4 408.0 L460.4 604.0Z" fill={`url(#bf_left${id})`}/>
<path d="M680.0 506.0 L436.0 646.0 L460.4 604.0 L631.2 506.0Z" fill={`url(#bf_bot${id})`}/>
<path d="M460.4 408.0 L631.2 506.0 L460.4 604.0Z" fill={`url(#bf_face${id})`}/>
<path d="M460.4 408.0 L631.2 506.0 L460.4 604.0Z" fill="#000" filter={`url(#brush${id})`} opacity=".35"/>
<path d="M436 366 L680 506" stroke="#e8f2f6" strokeWidth="3" opacity=".75"/>
<path d="M460.4 408.0 L631.2 506.0" stroke="#fff0d0" strokeWidth="2" opacity=".35"/>
<path d="M680.0 506.0 L436.0 646.0 L460.4 604.0 L631.2 506.0Z" fill={`url(#warmbot${id})`}/>
<path d="M436 646 L680 506" stroke="#ff9a55" strokeWidth="2.5" opacity=".45"/>
<circle cx="676" cy="506" r="40" fill={`url(#ember${id})`} opacity=".85"/><rect x="100" y="100" width="824" height="824" filter={`url(#grain${id})`}/>
      </g>
    </>
  );
}

export function Logo(props: { size?: number; className?: string }): JSX.Element {
  const { size = 40, className } = props;
  // useId 返回的 ":r0:" 含冒号，在 url(#...) 中不合法，去掉
  const id = useId().replace(/:/g, '');
  const Art = size <= TINY_MAX ? TinyArt : size <= SIMPLE_MAX ? SimpleArt : FullArt;
  return (
    <svg
      width={size}
      height={size}
      viewBox="100 100 824 824"
      className={className}
      role="img"
      aria-label="随心看"
      xmlns="http://www.w3.org/2000/svg"
    >
      <Art id={id} />
      <path d={SQUIRCLE} fill="none" stroke="#9fb4c0" strokeOpacity="0.16" strokeWidth="3" />
    </svg>
  );
}

export default Logo;
