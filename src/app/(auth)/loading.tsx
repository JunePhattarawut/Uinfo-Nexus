export default function AuthLoading() {
  return (
    <>
      <style>{`
        @keyframes uinfo-reveal {
          0%   { clip-path: inset(0 100% 0 0); opacity: 1; }
          40%  { clip-path: inset(0 0% 0 0);   opacity: 1; }
          75%  { clip-path: inset(0 0% 0 0);   opacity: 1; }
          90%  { clip-path: inset(0 0% 0 0);   opacity: 0; }
          100% { clip-path: inset(0 100% 0 0); opacity: 0; }
        }
        @keyframes uinfo-tip {
          0%   { transform: translateX(0);     opacity: 0; }
          2%   { opacity: 1; }
          40%  { transform: translateX(148px); opacity: 1; }
          42%  { opacity: 0; }
          99%  { opacity: 0; transform: translateX(0); }
          100% { opacity: 0; transform: translateX(0); }
        }
        @keyframes uinfo-line {
          0%,40% { width: 0%;   opacity: 0; }
          44%    { opacity: 1; }
          75%    { width: 100%; opacity: 1; }
          90%    { opacity: 0; }
          100%   { opacity: 0; width: 0%; }
        }
        @keyframes uinfo-text {
          0%,42% { opacity: 0; letter-spacing: .28em; }
          56%    { opacity: 1; letter-spacing: .12em; }
          75%    { opacity: 1; }
          90%    { opacity: 0; }
          100%   { opacity: 0; }
        }
      `}</style>

      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#ffffff",
      }}>
        <div style={{ position: "relative", width: 150, height: 112, overflow: "hidden" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/uinfo-logo.png"
            alt="UINFO"
            style={{
              width: 150,
              height: 150,
              objectFit: "cover",
              objectPosition: "top center",
              display: "block",
              animation: "uinfo-reveal 5s cubic-bezier(.6,0,.2,1) infinite",
            }}
          />
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 2,
            height: "100%",
            background: "#2D2B8E",
            borderRadius: 1,
            animation: "uinfo-tip 5s cubic-bezier(.6,0,.2,1) infinite",
          }} />
        </div>

        <div style={{
          width: 150,
          height: 1,
          background: "rgba(45,43,142,.12)",
          marginTop: 20,
          overflow: "hidden",
          borderRadius: 1,
        }}>
          <div style={{
            height: 1,
            background: "#2D2B8E",
            borderRadius: 1,
            animation: "uinfo-line 5s cubic-bezier(.6,0,.2,1) infinite",
          }} />
        </div>

        <p style={{
          margin: "14px 0 0 0",
          fontFamily: "system-ui, sans-serif",
          fontSize: 15,
          fontWeight: 500,
          color: "#2D2B8E",
          letterSpacing: ".12em",
          animation: "uinfo-text 5s cubic-bezier(.6,0,.2,1) infinite",
        }}>
          UINFO
        </p>
      </div>
    </>
  );
}
