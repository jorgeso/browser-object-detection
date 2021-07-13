import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
  @ViewChild('videoPlayer', { read: ElementRef }) videoPlayer: ElementRef;
  @ViewChild('canvasElement', { read: ElementRef }) canvasRef: ElementRef;
  width: 0;
  height: 0;

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

  detectFrame() {
    this.width = this.videoPlayer.nativeElement.videoWidth;
    this.height = this.videoPlayer.nativeElement.videoHeight;
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

  processInput() {
    const tfimg = tf.browser.fromPixels(this.videoPlayer.nativeElement).toInt();
    const expandedimg = tfimg.transpose([0, 1, 2]).expandDims();
    return expandedimg;
  };

  buildDetectedObjects(scores, threshold, boxes, classes) {
    const detectionObjects = []
    // var video_frame = document.getElementById('frame');

    scores[0].forEach((score, i) => {
      if (score > threshold) {
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
          class: classes[i],
          label: cocoLabels[classes[i]],
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
    const classes = predictions[2].dataSync();
    
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
    const stream = this.canvasRef.nativeElement.srcObject;
    if (stream != null) {
      const tracks = stream.getTracks();
    
      tracks.forEach(track => {
        track.stop();
      });
    
      this.canvasRef.nativeElement.srcObject = null;
    }
  }
}
