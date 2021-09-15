import React, { useCallback } from 'react';

import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import moment from 'moment';
import numeral from 'numeral';
import { useTranslation } from 'react-i18next';
import {
  AppState,
  Image,
  Linking,
  Platform,
  StyleSheet,
  View
} from 'react-native';

import i18n from 'lib/localization';

import Button from 'components/Button';
import Text, { StyleText } from 'components/Text';

import { IModalApi, useModal } from 'contexts/modal-context';
import { PermissionType } from 'hooks/usePermission';

interface IPermissionSettingsModalProps {
  message: string;
  title: string;
  steps: Array<{ label: string; image: any }>;
}

export default function PermissionSettingsModal(
  props: IPermissionSettingsModalProps
) {
  const modal = useModal();
  const { t } = useTranslation();

  const goToSettings = useCallback(
    function goToSettings() {
      modal.confirm();
    },
    [modal.confirm]
  );

  return (
    <View style={styles.background}>
      <View style={styles.dialog}>
        <Text design="h3">{props.title}</Text>

        <Text style={styles.message}>{props.message}</Text>

        <StyleText style={styles.stepText}>
          {props.steps.map((step, ix) => (
            <View style={styles.step} key={step.label}>
              <Text>{numeral(ix + 1).format()}. </Text>

              {step.image && (
                <Image
                  source={step.image}
                  resizeMode="contain"
                  fadeDuration={0}
                />
              )}

              <Text>
                {step.image ? ' ' : ''}
                {step.label}
              </Text>
            </View>
          ))}
        </StyleText>

        <View style={styles.buttonContainer}>
          <Button
            onPress={goToSettings}
            label={t('permissions.general.goToSettings')}
            innerViewStyle={buttonBackgroundStyle}
          />
        </View>
      </View>
    </View>
  );
}

const buttonBackgroundStyle = { backgroundColor: '#3277F7' };

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  dialog: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    alignItems: 'center',
    padding: 16,
    width: '85%'
  },

  message: {
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16
  },

  buttonContainer: {
    paddingTop: 40
  },

  step: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: 8
  },

  stepText: {
    fontSize: 18
  }
});

function openAppSettings() {
  if (Platform.OS === 'ios') {
    Linking.openURL('app-settings:');
  } else {
    // otherwise the settings open in-app
    const FLAG_ACTIVITY_NEW_TASK = 268435456;
    // so that when they hit back button, after tapping into permissions, it
    // doesnt take them back to the app settings, it brings them back to the
    // app. this also makes it so that when they leave the app settings page it
    // closes.
    const FLAG_ACTIVITY_NO_HISTORY = 1073741824;
    const FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS = 8388608;
    IntentLauncher.startActivityAsync(
      IntentLauncher.ACTION_APPLICATION_DETAILS_SETTINGS,
      {
        data: 'package:' + Constants.manifest!.android!.package,
        flags:
          FLAG_ACTIVITY_NEW_TASK |
          FLAG_ACTIVITY_NO_HISTORY |
          FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
      }
    );
  }
}

export async function openPermissionSettings(
  modal: IModalApi,
  type: PermissionType,
  message: IPermissionSettingsModalProps['message']
) {
  let steps;
  if (type === 'camera') {
    steps = getCameraSteps();
  } else if (type === 'location') {
    steps = getLocationSteps();
  } else if (type === 'notifications') {
    steps = getNotificationsSteps();
  } else {
    throw new Error(`Unsupported permission type of "${type}".`);
  }

  await Promise.all(
    steps
      .map(step => step.image)
      .filter(Boolean)
      .map(asset => Asset.loadAsync(asset))
  );

  await modal.open(
    <PermissionSettingsModal
      title={
        {
          camera: i18n.t('permissions.title.camera'),
          notifications: i18n.t('permissions.title.notifications'),
          location: i18n.t('permissions.title.location')
        }[type]
      }
      message={message}
      steps={steps}
    />
  );

  const settingsOpenedAt = moment();

  openAppSettings();

  // Wait for user to enable it, then come back. After he comes back, try to
  // get access.
  await new Promise(resolve =>
    AppState.addEventListener(
      'change',
      function handleAppStateChange(nextAppState) {
        if (nextAppState === 'active') {
          const millisSinceSettingsOpened = moment().diff(
            settingsOpenedAt,
            'milliseconds'
          );
          // TODO: log to datadog how long it took to come back

          // On Android, it fires "background" then "active" then "background"
          // again all within a second when I use FLAG_ACTIVITY_NEW_TASK. So I
          // ignore the first active as it obviously must take the user at least
          // one second to hit back once the app settings open.
          if (millisSinceSettingsOpened > 1000) {
            AppState.removeEventListener('change', handleAppStateChange);
            resolve(undefined);
          }
        }
      }
    )
  );
}

function getCameraSteps() {
  return [
    { label: i18n.t('permissions.general.tapGoToSettings') },
    ...(Platform.OS === 'android'
      ? [{ label: i18n.t('permissions.general.tapPermissions') }]
      : []),
    {
      label: i18n.t('permissions.findCameraSetting'),
      image:
        Platform.OS === 'ios'
          ? require('./CameraIos.png')
          : require('./CameraAndroid.png')
    },
    {
      label: i18n.t('permissions.tapToGreen'),
      image:
        Platform.OS === 'ios'
          ? require('./ToggleOnIos.png')
          : require('./ToggleOnAndroid.png')
    }
  ];
}

function getNotificationsSteps() {
  return [
    { label: i18n.t('permissions.general.tapGoToSettings') },
    {
      label: i18n.t('permissions.tapNotifications'),
      image:
        Platform.OS === 'ios' ? require('./NotificationsIos.png') : undefined
    },
    {
      label: i18n.t('permissions.turnOnAllowNotifications'),
      image:
        Platform.OS === 'ios'
          ? require('./ToggleOnIos.png')
          : require('./ToggleOnAndroid.png')
    }
  ];
}

function getLocationSteps() {
  return [
    { label: i18n.t('permissions.general.tapGoToSettings') },
    ...(Platform.OS === 'android'
      ? [{ label: i18n.t('permissions.general.tapPermissions') }]
      : []),
    {
      label:
        Platform.OS === 'ios'
          ? i18n.t('permissions.tapLocation')
          : i18n.t('permissions.findLocationSetting'),
      image:
        Platform.OS === 'ios'
          ? require('./LocationIos.png')
          : require('./LocationAndroid.png')
    },
    {
      label:
        Platform.OS === 'ios'
          ? i18n.t('permissions.tapLocationWhileUsingTheApp')
          : i18n.t('permissions.tapToGreen'),
      image:
        Platform.OS === 'ios'
          ? require('./LocationOnIos.png')
          : require('./ToggleOnAndroid.png')
    }
  ];
}
