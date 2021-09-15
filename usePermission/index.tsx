import React, { useCallback, useRef } from 'react';

import {
  BarCodeScanner,
  PermissionResponse,
  PermissionStatus
} from 'expo-barcode-scanner';
import * as Permissions from 'expo-permissions';
import useForceUpdate from 'use-force-update';

import i18n from 'lib/localization';
import { captureSentry } from 'lib/sentry';

import BasicModal from 'components/Modals/BasicModal';
import { openPermissionSettings } from 'components/Modals/PermissionSettingsModal';

import { useModal } from 'contexts/modal-context';
import useMountEffect from 'hooks/useMountEffect';

export enum PermissionState {
  Granted = 'Granted',
  Denied = 'Denied',
  UnexpectedError = 'UnexpectedError',
  NotYetRequested = 'NotYetRequested',
  Requesting = 'Requesting'
}

export enum PermissionType {
  camera = 'camera',
  notifications = 'notifications',
  location = 'location'
}

interface IUsePermissionInputs {
  type: PermissionType;
  // this should be short and end in a colon. Like "To scan QR codes:". This is
  // the line before a number list of instructions in order to enable the
  // feature. its a function so i dont cause re-render by using t('asdf')
  getReason: () => string;
  options?: {
    autoRequest?: boolean;
    // if set to true, then `state` is always undefined, and `request` resolve
    // value is how to use this
    noRender?: boolean;
  };
}

interface IUsePermissionApiBase {
  request: () => Promise<PermissionState>;
}

export interface IUsePermissionApiWithRender extends IUsePermissionApiBase {
  state: PermissionState;
}

export interface IUsePermissionApiWithoutRender extends IUsePermissionApiBase {
  state: undefined;
}

export type IUsePermissionApi = IUsePermissionApiWithoutRender &
  IUsePermissionApiWithRender;

export default function usePermission(
  inputs: IUsePermissionInputs
): IUsePermissionApi {
  const savedInputs = useRef(inputs);
  savedInputs.current = inputs;

  const savedState = useRef(
    inputs.options?.autoRequest
      ? PermissionState.Requesting
      : PermissionState.NotYetRequested
  );
  const forceUpdate = useForceUpdate();

  const savedIsAutoRequest = useRef(false);

  const modal = useModal();

  const request = useCallback(
    function maybeRequestPermission() {
      const isAutoRequest = savedIsAutoRequest.current;
      savedIsAutoRequest.current = false;

      return new Promise<PermissionState>(async resolve => {
        let ask: () => Promise<PermissionResponse>;
        let check: () => Promise<PermissionResponse>;
        if (savedInputs.current.type === PermissionType.camera) {
          ask = BarCodeScanner.requestPermissionsAsync;
          check = BarCodeScanner.getPermissionsAsync;
        } else if (savedInputs.current.type === PermissionType.location) {
          ask = () => Permissions.askAsync(Permissions.LOCATION);
          check = () => Permissions.getAsync(Permissions.LOCATION);
        } else if (savedInputs.current.type === PermissionType.notifications) {
          ask = () => Permissions.askAsync(Permissions.NOTIFICATIONS);
          check = () => Permissions.getAsync(Permissions.NOTIFICATIONS);
        } else {
          throw new Error(
            `Unsupported permission type of "${savedInputs.current.type}".`
          );
        }

        const setState = (nextState: PermissionState) => {
          if (savedState.current !== nextState) {
            savedState.current = nextState;
            if (!savedInputs.current.options?.noRender) {
              forceUpdate();
            }
          }
        };

        const prevState = savedState.current;

        if (prevState === PermissionState.Granted) {
          captureSentry(
            'Permission has already been granted, will not request again.',
            'usePermission.maybeRequestPermission',
            {
              tags: { permission: savedInputs.current.type },
              extras: { state: prevState }
            }
          );

          resolve(prevState);
        } else if (
          prevState === PermissionState.Requesting &&
          // if isAutoRequest than it starts of in Requesting state, but it
          // actually hasnt started requesting yet
          !isAutoRequest
        ) {
          captureSentry(
            'Cannot request permission while it is in the process of requesting.',
            'usePermission.maybeRequestPermission',
            {
              tags: { permission: savedInputs.current.type },
              extras: { state: prevState }
            }
          );

          resolve(prevState);
        } else {
          setState(PermissionState.Requesting);

          const setStateAndResolve = (nextState: PermissionState) => {
            setState(nextState);
            resolve(nextState);
          };

          let checkResponse: PermissionResponse;
          try {
            checkResponse = await check();
          } catch (error) {
            captureSentry(
              error,
              'usePermission.requestPermission.checkMethod',
              { tags: { permission: savedInputs.current.type } }
            );

            setStateAndResolve(PermissionState.UnexpectedError);

            return;
          }

          if (checkResponse.status === PermissionStatus.GRANTED) {
            setStateAndResolve(PermissionState.Granted);
            return;
          } else {
            if (!checkResponse.canAskAgain) {
              await openPermissionSettings(
                modal,
                savedInputs.current.type,
                savedInputs.current.getReason()
              );
            }

            let askResponse: PermissionResponse;
            try {
              askResponse = await ask();
            } catch (error) {
              captureSentry(
                error,
                'usePermission.requestPermission.askMethod',
                {
                  tags: { permission: savedInputs.current.type },
                  extras: { checkResponse }
                }
              );

              setStateAndResolve(PermissionState.UnexpectedError);

              return;
            }

            if (askResponse.status === PermissionStatus.GRANTED) {
              setStateAndResolve(PermissionState.Granted);
            } else if (askResponse.status === PermissionStatus.DENIED) {
              if (!checkResponse.canAskAgain) {
                // user failed to enable it in the settings, so offer him how
                // to get instructions again.
                await modal.open(
                  <BasicModal
                    title={
                      {
                        camera: i18n.t(
                          'permissions.settingFailure.title.camera'
                        ),
                        notifications: i18n.t(
                          'permissions.settingFailure.title.notifications'
                        ),
                        location: i18n.t(
                          'permissions.settingFailure.title.location'
                        )
                      }[savedInputs.current.type]
                    }
                    message={
                      {
                        camera: i18n.t(
                          'permissions.settingFailure.message.camera'
                        ),
                        notifications: i18n.t(
                          'permissions.settingFailure.message.notifications'
                        ),
                        location: i18n.t(
                          'permissions.settingFailure.message.location'
                        )
                      }[savedInputs.current.type]
                    }
                    button={i18n.t('generic.okay')}
                  />
                );
              }

              setStateAndResolve(PermissionState.Denied);
            } else if (askResponse.status === PermissionStatus.UNDETERMINED) {
              captureSentry(
                'Got undetermined after permission request.',
                'usePermission.requestPermission.askMethod',
                {
                  tags: { permission: savedInputs.current.type },
                  extras: { askResponse, checkResponse }
                }
              );

              setStateAndResolve(PermissionState.UnexpectedError);
            } else {
              captureSentry(
                'Unhandled permission status returned.',
                'usePermission.requestPermission',
                {
                  tags: { permission: savedInputs.current.type },
                  extras: { askResponse, checkResponse }
                }
              );

              setStateAndResolve(PermissionState.UnexpectedError);
            }
          }
        }
      });
    },
    [savedState, savedInputs]
  );

  useMountEffect(function requestOnMount() {
    if (inputs.options?.autoRequest) {
      savedIsAutoRequest.current = true;
      request();
    }
  });

  if (inputs.options?.noRender) {
    return {
      state: undefined,
      request
    };
  } else {
    return {
      state: savedState.current,
      request
    };
  }
}
