import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

/** The Automorphic mark. The exported name preserves existing imports. */
export function T3Wordmark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const theme = { color: props.color, colorClassName: props.colorClassName };
  return (
    <Svg
      accessibilityLabel="Automorphic"
      height={props.height}
      width={props.height}
      viewBox="0 0 100 100"
      fill="none"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <ThemedPath
        {...theme}
        d="M50 5 89 27.5V72.5L50 95 11 72.5V27.5Z M50 5V25M89 27.5 71 37.5M89 72.5 71 62.5M50 95V75M11 72.5 29 62.5M11 27.5 29 37.5"
        stroke="currentColor"
      />
      <ThemedPath
        {...theme}
        d="M50 15 80 32.5V67.5L50 85 20 67.5V32.5Z"
        stroke="currentColor"
        opacity={0.7}
      />
      <ThemedPath
        {...theme}
        d="M50 25 71 37.5V62.5L50 75 29 62.5V37.5Z"
        stroke="currentColor"
        opacity={0.4}
      />
      <ThemedPath
        {...theme}
        d="M50 25 71 62.5M71 37.5 29 62.5M71 62.5 29 37.5M50 75 29 37.5"
        stroke="currentColor"
        opacity={0.4}
        strokeDasharray="2 2"
      />
      <ThemedPath {...theme} d="M52 50a2 2 0 1 1-4 0 2 2 0 0 1 4 0" fill="currentColor" />
    </Svg>
  );
}
