// Metro turns image imports into asset ids that <Image source> accepts.
declare module '*.png' {
  const src: number;
  export default src;
}
