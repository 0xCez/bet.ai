import React, { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import ActionSheet, { ActionSheetRef } from "react-native-actions-sheet";
import { TouchableOpacity } from "react-native-gesture-handler";
import i18n from "../../i18n";

interface ImagePickerSheetProps {
  isVisible: boolean;
  onClose: () => void;
  onCameraPress: () => void;
  onGalleryPress: () => void;
}

export function ImagePickerSheet({
  isVisible,
  onClose,
  onCameraPress,
  onGalleryPress,
}: ImagePickerSheetProps) {
  const actionSheetRef = useRef<ActionSheetRef>(null);

  React.useEffect(() => {
    if (isVisible) {
      actionSheetRef.current?.show();
    } else {
      actionSheetRef.current?.hide();
    }
  }, [isVisible]);

  const handleGalleryPress = async () => {
    await actionSheetRef.current?.hide();
    setTimeout(() => {
      onGalleryPress();
    }, 300);
  };

  const handleCameraPress = async () => {
    await actionSheetRef.current?.hide();
    setTimeout(() => {
      onCameraPress();
    }, 300);
  };

  const handleClose = async () => {
    await actionSheetRef.current?.hide();
    setTimeout(() => {
      onClose();
    }, 300);
  };

  return (
    <ActionSheet
      ref={actionSheetRef}
      onClose={onClose}
      containerStyle={styles.container}
      indicatorStyle={styles.indicator}
      gestureEnabled={true}
    >
      <View style={styles.contentContainer}>
        <TouchableOpacity
          style={[styles.option, styles.topOption]}
          onPress={handleGalleryPress}
        >
          <Text style={styles.optionText}>
            {i18n.t("imagePickerChooseFromLibrary")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, styles.bottomOption]}
          onPress={handleCameraPress}
        >
          <Text style={styles.optionText}>
            {i18n.t("imagePickerTakePhoto")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, styles.cancelOption]}
          onPress={handleClose}
        >
          <Text style={[styles.optionText, styles.cancelText]}>
            {i18n.t("imagePickerCancel")}
          </Text>
        </TouchableOpacity>
      </View>
    </ActionSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0C0C0C",
    opacity: 0.9,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  indicator: {
    backgroundColor: "#ffffff40",
    width: 0,
    height: 0,
  },
  contentContainer: {
    padding: 8,
    gap: 0,
  },
  option: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    backgroundColor: "#2A2A2A",
  },
  topOption: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#3A3A3A",
  },
  middleOption: {
    borderRadius: 0,
  },
  bottomOption: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: "#2A2A2A",
  },
  cancelOption: {
    backgroundColor: "#2A2A2A",
    borderRadius: 14,
    marginTop: 10,
  },
  optionText: {
    color: "#0A84FF",
    fontSize: 22,
    fontWeight: "400",
  },
  cancelText: {
    color: "#0A84FF",
    fontWeight: "600",
  },
});
