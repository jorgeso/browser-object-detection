import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import * as tf from '@tensorflow/tfjs';
import { loadGraphModel } from '@tensorflow/tfjs-converter';
import { cocoLabels } from './coco_labels.constant';
import { PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// Based on the following tutorial and repository:
// https://blog.tensorflow.org/2021/01/custom-object-detection-in-browser.html
// https://github.com/hugozanini/TFJS-object-detection

@Component({
  selector: 'app-detect-objects',
  templateUrl: './detect-objects.component.html',
  styleUrls: ['./detect-objects.component.scss']
})
export class DetectObjectsComponent implements OnInit, AfterViewInit, OnDestroy {
  private threshold = 0.7;
  model: tf.GraphModel;
  @ViewChild('videoPlayer', { read: ElementRef, static: false }) videoPlayer: ElementRef;
  @ViewChild('canvasElement', { read: ElementRef, static: false }) canvasRef: ElementRef;
  width: 0;
  height: 0;
  classes = [];

  constructor(
    @Inject(PLATFORM_ID) private platformId: string
  ) {
    if (isPlatformBrowser(this.platformId)) {
      tf.setBackend('webgl');
    }
  }

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      // https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
      // https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamConstraints
      // https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints

      let facingMode = 'user';

      if( /Android|webOS|iPhone|iPad|Mac|Macintosh|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) {
        facingMode = 'environment'
      }

      navigator.mediaDevices
        .getUserMedia({
          audio: false,
          video: {
            facingMode: facingMode
          }
        })
        .then(stream => {
          this.videoPlayer.nativeElement.srcObject = stream;
          loadGraphModel('assets/models/ssd_model.json').then(response => {
            this.model = response;
          });
        }).catch(error => {
          console.log(error);
        });
    }
  }

  ngOnDestroy() {
    this.stopStreamedVideo();
  }

  handleOnLoad(): void {
    const videoDims = this.videoDimensions();
    this.setDimmensions(videoDims);
    this.detectFrame();
  }

  detectFrame() {
    tf.engine().startScope();
    this.model.executeAsync(this.processInput()).then(predictions => {
      this.renderPredictions(predictions);
      requestAnimationFrame(() => {
        this.detectFrame();
      });
      tf.engine().endScope();
    }, error => {
      console.log(error);
    });
  }

  setDimmensions(videoDims): void {
    this.videoPlayer.nativeElement.width = videoDims.width;
    this.canvasRef.nativeElement.width = videoDims.width;
    this.videoPlayer.nativeElement.height = videoDims.height;
    this.canvasRef.nativeElement.height = videoDims.height;
  }

  // https://stackoverflow.com/questions/17056654/getting-the-real-html5-video-width-and-height
  videoDimensions() {
    // Ratio of the video's intrisic dimensions
    const videoRatio = this.videoPlayer.nativeElement.videoWidth / this.videoPlayer.nativeElement.videoHeight;
    // The width and height of the video element
    let width = this.videoPlayer.nativeElement.offsetWidth
    let height = this.videoPlayer.nativeElement.offsetHeight;
    // The ratio of the element's width to its height
    const elementRatio = width/height;
    // If the video element is short and wide
    if (elementRatio > videoRatio) {
      width = height * videoRatio;
    }
    // It must be tall and thin, or exactly equal to the original ratio
    else {
      height = width / videoRatio;
    }
    return {
      width: width,
      height: height
    };
  }

  processInput() {
    const tfimg = tf.browser.fromPixels(this.videoPlayer.nativeElement).toInt();
    const expandedimg = tfimg.transpose([0, 1, 2]).expandDims();
    return expandedimg;
  };

  buildDetectedObjects(scores, threshold, boxes, classes) {
    const detectionObjects = []
    // var video_frame = document.getElementById('frame');
    this.classes = [];
    scores[0].forEach((score, i) => {
      if (score > threshold) {
        this.classes.push(classes[0][i]);
        this.classes.push(classes[1][i]);
        const bbox = [];
        const minY = boxes[0][i][0] * this.videoPlayer.nativeElement.offsetHeight;
        const minX = boxes[0][i][1] * this.videoPlayer.nativeElement.offsetWidth;
        const maxY = boxes[0][i][2] * this.videoPlayer.nativeElement.offsetHeight;
        const maxX = boxes[0][i][3] * this.videoPlayer.nativeElement.offsetWidth;
        bbox[0] = minX;
        bbox[1] = minY;
        bbox[2] = maxX - minX;
        bbox[3] = maxY - minY;
        detectionObjects.push({
          class: classes[0][i],
          label: cocoLabels[classes[0][i]] || cocoLabels[classes[1][i]],
          score: score.toFixed(4),
          bbox: bbox
        })
      }
    })
    return detectionObjects
  }

  renderPredictions(predictions) {
    const ctx = this.canvasRef.nativeElement.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Font options.
    const font = "16px sans-serif";
    ctx.font = font;
    ctx.textBaseline = "top";

    //Getting predictions
    const boxes = predictions[0].arraySync();
    const scores = predictions[6].arraySync();
    const classes = {
      0: predictions[2].dataSync(),
      1: predictions[3].dataSync()
    }
    
    const detections = this.buildDetectedObjects(scores, this.threshold,
      boxes, classes);
    detections.forEach(item => {
      const x = item['bbox'][0];
      const y = item['bbox'][1];
      const width = item['bbox'][2];
      const height = item['bbox'][3];

      // Draw the bounding box.
      ctx.strokeStyle = "#00FFFF";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      // Draw the label background.
      ctx.fillStyle = "#00FFFF";
      const textWidth = ctx.measureText(item["label"] + " " + (100 * item["score"]).toFixed(2) + "%").width;
      const textHeight = parseInt(font, 10); // base 10
      ctx.fillRect(x, y, textWidth + 4, textHeight + 4);
    });

    detections.forEach(item => {
      const x = item['bbox'][0];
      const y = item['bbox'][1];

      // Draw the text last to ensure it's on top.
      ctx.fillStyle = "#000000";
      ctx.fillText(item["label"] + " " + (100 * item["score"]).toFixed(2) + "%", x, y);
    });
  };

  stopStreamedVideo() {
    // https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop
    const stream = this.videoPlayer.nativeElement.srcObject;
    if (stream != null) {
      const tracks = stream.getTracks();
    
      tracks.forEach(track => {
        track.stop();
      });
    
      this.videoPlayer.nativeElement.srcObject = null;
    }
  }
}
