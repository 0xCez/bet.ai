import React, { useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Dimensions, Animated } from "react-native";
import Svg, {
  Rect,
  Line,
  Text as SvgText,
  Defs,
  ClipPath,
} from "react-native-svg";
import { Image as ExpoImage } from "expo-image";
import { colors, spacing, typography } from "../../constants/designTokens";
import { getNBATeamLogo } from "../../utils/teamLogos";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ── Types ──

export interface GameLogEntry {
  date: string | null;
  displayDate: string;
  opponent: string | null;
  opponentCode: string | null;
  value: number;
  hit: boolean;
}

interface PropChartBarGraphProps {
  gameLogs: GameLogEntry[];
  line: number;
  matchup?: {
    opponent: string;
    opponentCode: string;
  };
  maxGames?: number;
}

// ── Constants ──

const CHART_WIDTH = SCREEN_WIDTH; // Full width — parent controls margins
const Y_AXIS_WIDTH = 28;
const CHART_AREA_WIDTH = CHART_WIDTH - Y_AXIS_WIDTH;
const SVG_HEIGHT = 300;
const TOP_PADDING = 28;
const BOTTOM_PADDING = 4;
const CHART_AREA_HEIGHT = SVG_HEIGHT - TOP_PADDING - BOTTOM_PADDING;
const BAR_RADIUS = 4;
const MIN_BAR_GAP = 2;
const MAX_BAR_WIDTH = 36;

const HIT_COLOR = colors.success;
const MISS_COLOR = colors.destructive;
const LINE_COLOR = "rgba(0, 215, 215, 0.5)";
const GRID_COLOR = "rgba(122, 139, 163, 0.12)";

// ── Animated SVG ──

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// ── Helpers ──

/**
 * Compute Y-axis scale that fits the data tightly.
 * Just +1 headroom above the tallest bar (for the value label), then pick
 * a clean tick step so the axis looks natural and proportional.
 */
function computeYScale(maxValue: number, line: number): { max: number; ticks: number[] } {
  // Ceiling = highest thing we need to display + 1 for the value label
  const ceiling = Math.ceil(Math.max(maxValue, line)) + 1;

  // Pick a step that gives ~4-6 ticks based on range
  let step: number;
  if (ceiling <= 5) step = 1;
  else if (ceiling <= 12) step = 2;
  else if (ceiling <= 18) step = 3;
  else if (ceiling <= 30) step = 5;
  else if (ceiling <= 60) step = 10;
  else step = 20;

  // Y-max = first multiple of step ≥ ceiling
  const max = Math.ceil(ceiling / step) * step;

  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) {
    ticks.push(v);
  }
  return { max, ticks };
}

function yPos(value: number, yMax: number): number {
  return TOP_PADDING + CHART_AREA_HEIGHT * (1 - value / yMax);
}

/**
 * Format ISO date to compact "M/D" format: "1/9", "2/21"
 */
function formatDateCompact(isoDate: string | null): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ── Component ──

const PropChartBarGraph: React.FC<PropChartBarGraphProps> = ({
  gameLogs,
  line,
  matchup,
  maxGames = 10,
}) => {
  const displayLogs = useMemo(
    () => gameLogs.slice(0, maxGames).reverse(),
    [gameLogs, maxGames]
  );
  const hasUpcoming = !!matchup;
  const totalBars = displayLogs.length + (hasUpcoming ? 1 : 0);

  // Compute bar width dynamically
  const computedBarWidth =
    totalBars > 0
      ? (CHART_AREA_WIDTH - MIN_BAR_GAP * (totalBars + 1)) / totalBars
      : 20;
  const barWidth = Math.min(computedBarWidth, MAX_BAR_WIDTH);
  const barGap =
    totalBars > 1
      ? (CHART_AREA_WIDTH - barWidth * totalBars) / (totalBars + 1)
      : MIN_BAR_GAP;

  // Dynamic sizing based on how many bars we have
  const showValueLabels = totalBars <= 15;

  // Calculate available px per slot to decide label density
  const slotWidth = totalBars > 0 ? CHART_AREA_WIDTH / totalBars : 40;
  // Need ~24px per labeled slot for a logo + date to breathe
  const showLabelEvery = slotWidth >= 24 ? 1 : slotWidth >= 12 ? 2 : 3;
  const logoSize = slotWidth >= 24 ? 20 : 16;
  const dateFontSize = slotWidth >= 24 ? 9 : 7;

  const maxValue = displayLogs.reduce((max, g) => Math.max(max, g.value), 0);
  const { max: yMax, ticks } = computeYScale(maxValue, line);

  // Animation values
  const barAnims = useRef<Animated.Value[]>([]);
  const prevCount = useRef(0);

  if (displayLogs.length !== prevCount.current) {
    barAnims.current = displayLogs.map(() => new Animated.Value(0));
    prevCount.current = displayLogs.length;
  }

  useEffect(() => {
    barAnims.current.forEach((a) => a.setValue(0));
    const animations = barAnims.current.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        delay: i * 40,
        useNativeDriver: false,
      })
    );
    Animated.stagger(40, animations).start();
  }, [displayLogs.length, maxGames]);

  const getBarX = (index: number) => {
    return Y_AXIS_WIDTH + barGap + index * (barWidth + barGap);
  };

  const lineY = yPos(line, yMax);

  return (
    <View style={styles.container}>
      <Svg width={CHART_WIDTH} height={SVG_HEIGHT}>
        <Defs>
          {displayLogs.map((_, i) => (
            <ClipPath key={`clip-${i}`} id={`barClip-${i}`}>
              <Rect
                x={getBarX(i)}
                y={0}
                width={barWidth}
                height={SVG_HEIGHT}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
              />
            </ClipPath>
          ))}
        </Defs>

        {/* Grid lines */}
        {ticks.map((tick) => (
          <Line
            key={`grid-${tick}`}
            x1={Y_AXIS_WIDTH}
            y1={yPos(tick, yMax)}
            x2={CHART_WIDTH}
            y2={yPos(tick, yMax)}
            stroke={GRID_COLOR}
            strokeWidth={1}
          />
        ))}

        {/* Y-axis labels */}
        {ticks.map((tick) => (
          <SvgText
            key={`ylabel-${tick}`}
            x={Y_AXIS_WIDTH - 4}
            y={yPos(tick, yMax) + 4}
            fontSize={10}
            fontFamily={typography.fontFamily.medium}
            fill={colors.mutedForeground}
            textAnchor="end"
          >
            {tick}
          </SvgText>
        ))}

        {/* Reference line at prop line value */}
        <Line
          x1={Y_AXIS_WIDTH}
          y1={lineY}
          x2={CHART_WIDTH}
          y2={lineY}
          stroke={LINE_COLOR}
          strokeWidth={1.5}
          strokeDasharray="6,4"
        />
        <SvgText
          x={CHART_WIDTH - 4}
          y={lineY - 6}
          fontSize={12}
          fontFamily={typography.fontFamily.bold}
          fill={colors.primary}
          textAnchor="end"
        >
          {line % 1 === 0 ? `${line}.0` : line}
        </SvgText>

        {/* Bars */}
        {displayLogs.map((game, i) => {
          const x = getBarX(i);
          const fullBarHeight = (game.value / yMax) * CHART_AREA_HEIGHT;
          const barY = TOP_PADDING + CHART_AREA_HEIGHT - fullBarHeight;
          const barColor = game.hit ? HIT_COLOR : MISS_COLOR;
          const anim = barAnims.current[i];
          if (!anim) return null;

          return (
            <React.Fragment key={`bar-${i}`}>
              <AnimatedRect
                x={x}
                y={anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [TOP_PADDING + CHART_AREA_HEIGHT, barY],
                })}
                width={barWidth}
                height={anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, fullBarHeight],
                })}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
                fill={barColor}
                opacity={0.88}
              />
              {showValueLabels && (
                <SvgText
                  x={x + barWidth / 2}
                  y={barY - 6}
                  fontSize={11}
                  fontFamily={typography.fontFamily.bold}
                  fill={colors.foreground}
                  textAnchor="middle"
                >
                  {Math.round(game.value)}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}

        {/* Upcoming game — dashed outline bar */}
        {hasUpcoming &&
          (() => {
            const upcomingIndex = displayLogs.length;
            const x = getBarX(upcomingIndex);
            const avgValue =
              displayLogs.length > 0
                ? displayLogs.reduce((s, g) => s + g.value, 0) / displayLogs.length
                : line;
            const projHeight = (avgValue / yMax) * CHART_AREA_HEIGHT;
            const projY = TOP_PADDING + CHART_AREA_HEIGHT - projHeight;

            return (
              <Rect
                x={x}
                y={projY}
                width={barWidth}
                height={projHeight}
                rx={BAR_RADIUS}
                ry={BAR_RADIUS}
                fill="none"
                stroke="rgba(0, 215, 215, 0.3)"
                strokeWidth={1.5}
                strokeDasharray="4,4"
              />
            );
          })()}
      </Svg>

      {/* X-axis: Team logos + dates (spaced to avoid overlap) */}
      <View style={styles.xAxis}>
        {displayLogs.map((game, i) => {
          const showLabel = i % showLabelEvery === 0;
          const teamLogo = showLabel && game.opponent ? getNBATeamLogo(game.opponent) : null;
          const dateStr = showLabel ? formatDateCompact(game.date) : "";
          const logoStyle = { width: logoSize, height: logoSize, borderRadius: logoSize / 2 };
          return (
            <View
              key={`xaxis-${i}`}
              style={[
                styles.xAxisItem,
                {
                  width: barWidth,
                  marginLeft: i === 0 ? Y_AXIS_WIDTH + barGap : barGap,
                },
              ]}
            >
              {showLabel ? (
                teamLogo ? (
                  <ExpoImage source={teamLogo} style={logoStyle} contentFit="contain" />
                ) : (
                  <View style={[styles.teamLogoFallback, logoStyle, { backgroundColor: colors.secondary }]}>
                    <Text style={styles.teamLogoText}>{game.opponentCode || "?"}</Text>
                  </View>
                )
              ) : null}
              {dateStr !== "" && (
                <Text style={[styles.xAxisDate, { fontSize: dateFontSize }]}>{dateStr}</Text>
              )}
            </View>
          );
        })}

        {hasUpcoming && matchup && (() => {
          const teamLogo = getNBATeamLogo(matchup.opponent);
          const logoStyle = { width: logoSize, height: logoSize, borderRadius: logoSize / 2 };
          return (
            <View style={[styles.xAxisItem, { width: barWidth, marginLeft: barGap }]}>
              {teamLogo ? (
                <ExpoImage source={teamLogo} style={[logoStyle, { opacity: 0.5 }]} contentFit="contain" />
              ) : (
                <View style={[styles.teamLogoFallback, logoStyle, { opacity: 0.5, backgroundColor: colors.secondary }]}>
                  <Text style={styles.teamLogoText}>{matchup.opponentCode}</Text>
                </View>
              )}
              <Text style={[styles.xAxisDate, { fontSize: dateFontSize, color: "rgba(0, 215, 215, 0.5)" }]}>Next</Text>
            </View>
          );
        })()}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
  },
  xAxis: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[1],
  },
  xAxisItem: {
    alignItems: "center",
    gap: 2,
    overflow: "visible",
  },
  teamLogo: {},
  teamLogoFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  teamLogoText: {
    fontSize: 7,
    fontFamily: typography.fontFamily.bold,
    color: colors.mutedForeground,
  },
  xAxisDate: {
    fontSize: 9,
    fontFamily: typography.fontFamily.medium,
    color: colors.mutedForeground,
    textAlign: "center",
  },
});

export default PropChartBarGraph;
