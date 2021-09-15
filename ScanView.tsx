export default function ScannerView(props: IScannerViewProps) {
  const permission = usePermission({
    type: PermissionType.camera,
    getReason: useCallback(function getCameraPermissionReason() {
      return i18n.t('scan.cameraPermissionReason');
    }, []),
    options: { autoRequest: true }
  });

  if (permission.state === PermissionState.Granted) {
    return (
      <View style={styles.grantedScannerView}>
        <BarCodeScanner
          style={styles.scanner}
          onBarCodeScanned={isScanningPaused ? undefined : handleScan}
        >
          {props.children}
        </BarCodeScanner>
      </View>
    );
  } else {
    return <NotYetGrantedView permission={permission} />;
  }
}

interface INotYetGrantedViewProps {
  permission: IUsePermissionApiWithRender;
}
const NotYetGrantedView = React.memo(function NotYetGrantedView(
  props: INotYetGrantedViewProps
) {
  const { t } = useTranslation();

  return (
    <View style={styles.notYetGrantedScannerView}>
      <Text style={styles.notYetGrantedMessage} design="h4">
        {
          {
            [PermissionState.NotYetRequested]: t(
              'scan.permission.notYetRequest'
            ),
            [PermissionState.UnexpectedError]: t(
              'scan.permission.unexpectedError'
            ),
            [PermissionState.Denied]: t('scan.errors.denied.message'),
            [PermissionState.Requesting]: t('scan.permission.loading')
          }[props.permission.state]
        }
      </Text>

      {props.permission.state === PermissionState.Requesting ? (
        <Spinner />
      ) : (
        <Button
          label={t('scan.grantButton')}
          onPress={props.permission.request}
        />
      )}
    </View>
  );
});
