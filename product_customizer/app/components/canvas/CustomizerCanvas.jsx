import { forwardRef } from "react";
import NativeCustomizerCanvas from "./CustomizerCanvas.native.jsx";

const CustomizerCanvas = forwardRef(function CustomizerCanvas(props, ref) {
  return <NativeCustomizerCanvas {...props} ref={ref} />;
});

export default CustomizerCanvas;
