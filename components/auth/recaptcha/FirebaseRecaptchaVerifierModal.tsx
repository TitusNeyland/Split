import type { FirebaseOptions } from 'firebase/app';
import * as React from 'react';
import { ActivityIndicator, Button, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FirebaseRecaptcha from './FirebaseRecaptcha';
import { RecaptchaVerifierError } from './recaptchaErrors';

export interface FirebaseAuthApplicationVerifier {
  readonly type: string;
  verify(): Promise<string>;
}

type Props = Omit<
  React.ComponentProps<typeof FirebaseRecaptcha>,
  'onVerify' | 'invisible' | 'verify' | 'onLoad' | 'onError' | 'onFullChallenge'
> & {
  title?: string;
  cancelLabel?: string;
  attemptInvisibleVerification?: boolean;
};

interface State {
  visible: boolean;
  visibleLoaded: boolean;
  invisibleLoaded: boolean;
  invisibleVerify: boolean;
  invisibleKey: number;
  resolve?: (token: string) => void;
  reject?: (error: Error) => void;
}

/**
 * In-app reCAPTCHA for Firebase Phone Auth / MFA on native (replaces deprecated expo-firebase-recaptcha).
 * Same behavior: WebView + firebase-auth.js from gstatic, implements ApplicationVerifier.
 */
export default class FirebaseRecaptchaVerifierModal
  extends React.Component<Props, State>
  implements FirebaseAuthApplicationVerifier
{
  static defaultProps = {
    title: 'reCAPTCHA',
    cancelLabel: 'Cancel',
  };

  state: State = {
    visible: false,
    visibleLoaded: false,
    invisibleLoaded: false,
    invisibleVerify: false,
    invisibleKey: 1,
  };

  static getDerivedStateFromProps(props: Props, state: State) {
    if (!props.attemptInvisibleVerification && state.invisibleLoaded) {
      return {
        invisibleLoaded: false,
        invisibleVerify: false,
      };
    }
    return null;
  }

  get type() {
    return 'recaptcha';
  }

  async verify(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.props.attemptInvisibleVerification) {
        this.setState({
          invisibleVerify: true,
          resolve,
          reject,
        });
      } else {
        this.setState({
          visible: true,
          visibleLoaded: false,
          resolve,
          reject,
        });
      }
    });
  }

  // firebase auth internal hook
  _reset(..._args: unknown[]) {}

  private onVisibleLoad = () => {
    this.setState({ visibleLoaded: true });
  };

  private onInvisibleLoad = () => {
    this.setState({ invisibleLoaded: true });
  };

  private onFullChallenge = async () => {
    this.setState({
      invisibleVerify: false,
      visible: true,
    });
  };

  private onError = () => {
    const { reject } = this.state;
    if (reject) {
      reject(
        new RecaptchaVerifierError('ERR_FIREBASE_RECAPTCHA_ERROR', 'Failed to load reCAPTCHA')
      );
    }
    this.setState({
      visible: false,
      invisibleVerify: false,
    });
  };

  private onVerify = (token: string) => {
    const { resolve } = this.state;
    if (resolve) {
      resolve(token);
    }
    this.setState((state) => ({
      visible: false,
      invisibleVerify: false,
      invisibleLoaded: false,
      invisibleKey: state.invisibleKey + 1,
    }));
  };

  cancel = () => {
    const { reject } = this.state;
    if (reject) {
      reject(new RecaptchaVerifierError('ERR_FIREBASE_RECAPTCHA_CANCEL', 'Cancelled by user'));
    }
    this.setState({
      visible: false,
    });
  };

  onDismiss = () => {
    if (this.state.visible) {
      this.cancel();
    }
  };

  render() {
    const { title, cancelLabel, attemptInvisibleVerification, ...otherProps } = this.props;
    const { visible, visibleLoaded, invisibleLoaded, invisibleVerify, invisibleKey } = this.state;
    const fb = otherProps.firebaseConfig as FirebaseOptions | undefined;

    return (
      <View style={styles.container}>
        {attemptInvisibleVerification && fb ? (
          <FirebaseRecaptcha
            {...otherProps}
            key={`invisible${invisibleKey}`}
            firebaseConfig={fb}
            style={styles.invisible}
            onLoad={this.onInvisibleLoad}
            onError={this.onError}
            onVerify={this.onVerify}
            onFullChallenge={this.onFullChallenge}
            invisible
            verify={invisibleLoaded && invisibleVerify}
          />
        ) : null}
        <Modal
          visible={visible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={this.cancel}
          onDismiss={this.onDismiss}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.cancel}>
                <Button
                  title={cancelLabel ?? FirebaseRecaptchaVerifierModal.defaultProps.cancelLabel}
                  onPress={this.cancel}
                />
              </View>
            </View>
            <View style={styles.content}>
              {fb ? (
                <FirebaseRecaptcha
                  {...otherProps}
                  firebaseConfig={fb}
                  style={styles.content}
                  onLoad={this.onVisibleLoad}
                  onError={this.onError}
                  onVerify={this.onVerify}
                />
              ) : null}
              {!visibleLoaded ? (
                <View style={styles.loader}>
                  <ActivityIndicator size="large" />
                </View>
              ) : null}
            </View>
          </SafeAreaView>
        </Modal>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    width: 0,
    height: 0,
  },
  invisible: {
    width: 300,
    height: 300,
  },
  modalContainer: {
    flex: 1,
  },
  header: {
    backgroundColor: '#FBFBFB',
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomColor: '#CECECE',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: {
    position: 'absolute',
    left: 8,
    justifyContent: 'center',
  },
  title: {
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 20,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
});
